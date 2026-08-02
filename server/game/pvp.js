/**
 * PVP mode: two players race on their own separate boards.
 *
 * Everything is addressed per player. Board state lives under player1Board /
 * player2Board (see ARCHITECTURE.md for the full room schema), and updates are
 * emitted to a single socket rather than the room. Progress is broadcast to the
 * opponent as a count of revealed safe cells.
 *
 * Both players race the SAME mine layout: startPvpGame builds one board and
 * hands it to both, with a shared opening already revealed. There is no
 * per-player generation on first click — that is what used to make the two
 * layouts differ. See ARCHITECTURE.md §5.
 *
 * Nothing here takes the lock it needs: game/index.js holds that player's action
 * lock across the call and reads the snapshot it passes in under it. Every
 * function below rewrites a whole board field, so calling one without it lets a
 * player's own two moves erase each other.
 *
 * Lifecycle events (start, reset, rematch) live in controllers/pvpController.js.
 */

const { updatePlayerStatsInRoom } = require('../utils/playerUtils');
const { getAdjacentCells, revealFrom, projectBoard, projectCells } = require('../domain/board');
const { pvpIndexOf } = require('../domain/pvpPlayer');
const { io } = require('../utils/initializeClient');
const roomRepo = require('../data/roomRepo');
const { readStamp } = require('../domain/clock');
const playerRepo = require('../data/playerRepo');
const { pvpPlayerFields: playerKeys } = require('../data/keys');
const { SERVER_EVENTS } = require('../../shared/events');

/** `pvpIndexOf` (see domain/pvpPlayer.js for why it never defaults), plus a log. */
const playerIndexOf = (playerData, socketId) => {
    const playerIndex = pvpIndexOf(playerData);
    if (playerIndex === null) {
        console.error(`Player ${socketId} has no pvpPlayerIndex set!`);
    }
    return playerIndex;
};

/*
 * A PVP finish is one player's, not the room's, so the stop is sent to that
 * socket and not written to room state — the opponent's clock must keep
 * running. The start still comes from the room, which is why it is read back
 * rather than invented here.
 */
const stopFor = async (room, socketId) => {
    const startedAt = readStamp(await roomRepo.getField(room, 'startedAt'));
    io.to(socketId).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt, endedAt: Date.now() });
};

/**
 * Stops the clock for BOTH players, because a winner ends the race for both.
 *
 * The loser's clock is the easy one to forget: they are still mid-board when it
 * happens, so nothing on their side ends. Leaving it running means their timer
 * keeps counting under a dialog telling them the game is over, and the summary
 * has no finish time to show.
 */
const stopRace = async (room) => {
    const startedAt = readStamp(await roomRepo.getField(room, 'startedAt'));
    io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt, endedAt: Date.now() });
};

/**
 * Reveals cells from (r, c) on ONE player's board. Hitting a mine ends the game
 * for that player only; the opponent keeps playing and is told they failed.
 *
 * Returns the number of safe cells revealed, or -1 if a mine was hit. Callers
 * branch on that -1, so it is kept as-is.
 */
const reveal = async (board, r, c, room, socketId, toUpdate, playerIndex) => {
    const { hitMine, cellsRevealed } = revealFrom(board, r, c, toUpdate);
    if (!hitMine) return cellsRevealed;

    const { gameOverKey } = playerKeys(playerIndex);
    await roomRepo.setFields(room, { [gameOverKey]: 'true' });

    // Notify this player they lost
    await stopFor(room, socketId);
    io.to(socketId).emit(SERVER_EVENTS.PVP_GAME_OVER);

    // This player's game is over, so reveal their mines -- to them only. The
    // opponent is still playing on their own board and learns nothing.
    io.to(socketId).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
        board: projectBoard(board, { revealMines: true }),
        playerIndex,
    });

    // Notify opponent with updated progress info
    const opponentSocket = await roomRepo.opponentOf(room, socketId);
    if (opponentSocket) {
        io.to(opponentSocket).emit(SERVER_EVENTS.PVP_OPPONENT_FAILED);
    }
    return -1; // Signal that mine was hit
};

// Broadcast progress update to opponent
const broadcastProgressUpdate = async (room, socketId, playerIndex, newProgress) => {
    const opponentSocket = await roomRepo.opponentOf(room, socketId);

    if (opponentSocket) {
        const totalSafeCells = parseInt(await roomRepo.getField(room, 'totalSafeCells') || '0', 10);
        io.to(opponentSocket).emit(SERVER_EVENTS.PVP_OPPONENT_PROGRESS, {
            progress: newProgress,
            totalSafeCells,
            percentage: totalSafeCells > 0 ? Math.round((newProgress / totalSafeCells) * 100) : 0
        });
    }
};

// Check win for PVP
const checkWin = async (board, room, socketId, playerIndex) => {
    const { gameOverKey, gameWonKey } = playerKeys(playerIndex);

    const roomState = await roomRepo.getState(room);

    // Don't check win if this player already won or lost
    if (roomState[gameOverKey] === 'true' || roomState[gameWonKey] === 'true') {
        return;
    }

    const allNonMinesOpened = board.every((row) =>
        row.every((cell) => cell.isMine || cell.isOpen)
    );

    if (allNonMinesOpened) {
        // Check if anyone has won yet
        const winnerSocket = roomState.winnerSocket;

        if (!winnerSocket || winnerSocket === '') {
            // This player is the first to win!
            const lockAcquired = await roomRepo.acquireWinnerLock(room, socketId);

            if (lockAcquired) {
                await roomRepo.setFields(room, {
                    [gameWonKey]: 'true',
                    winnerSocket: socketId
                });
                await stopRace(room);

                const playerName = await playerRepo.getName(socketId);

                // Notify both players
                io.to(room).emit(SERVER_EVENTS.PVP_PLAYER_WON, {
                    winnerSocket: socketId,
                    winnerName: playerName
                });

                await roomRepo.releaseWinnerLock(room);
            }
        } else {
            // Someone else already won, so `stopRace` has already stopped this
            // player's clock at the moment the race actually ended. Stamping it
            // again here would push their finish time out to whenever they
            // happened to fill in the rest of their board.
            await roomRepo.setFields(room, { [gameWonKey]: 'true' });
        }
    }
};

// PVP-specific open cell
const openCell = async (row, col, room, socketId, roomState, playerScore, playerData) => {
    // Check if game has started
    if (roomState.pvpStarted !== 'true') {
        return;
    }

    // Get player index - must be set by startPvpGame
    const playerIndex = playerIndexOf(playerData, socketId);
    if (playerIndex === null) return;
    const { boardKey, initializedKey, gameOverKey, gameWonKey, progressKey } = playerKeys(playerIndex);

    // Return if this player's game is over or won
    if (roomState[gameOverKey] === 'true' || roomState[gameWonKey] === 'true') {
        return;
    }

    const numRows = parseInt(roomState.numRows, 10);
    const numCols = parseInt(roomState.numCols, 10);
    const numMines = parseInt(roomState.numMines, 10);

    // Validate bounds
    if (row < 0 || row >= numRows || col < 0 || col >= numCols) return;

    // Boards are created for both players by startPvpGame, so one always exists
    // by the time a cell can be clicked. There is no per-player lazy generation:
    // that is what used to give the two players different mine layouts.
    if (roomState[initializedKey] !== 'true') {
        console.error(`[PVP] board not initialised for player ${playerIndex}`);
        return;
    }
    const boardData = roomState[boardKey];
    if (!boardData || boardData === '') {
        console.error(`[PVP] Board data missing for player ${playerIndex}`);
        return;
    }
    const board = JSON.parse(boardData);

    // Validate board
    if (!board || !Array.isArray(board) || board.length === 0) return;

    // Check invalid scenarios
    if (
        board[row][col] === undefined ||
        !board[row][col] ||
        board[row][col].isOpen ||
        board[row][col].isFlagged
    ) return;

    // Reveal cells and get count of safe cells revealed
    const toUpdate = [];
    const safeCellsRevealed = await reveal(board, row, col, room, socketId, toUpdate, playerIndex);

    // If mine was hit, safeCellsRevealed will be -1
    if (safeCellsRevealed === -1) {
        // Save board state with revealed mine
        await roomRepo.setPvpBoard(room, playerIndex, board);
        io.to(socketId).emit(SERVER_EVENTS.PVP_UPDATE_CELLS, projectCells(toUpdate));
        return;
    }

    // Update progress tracking - need to get fresh state since board may have just been initialized
    const freshRoomState = await roomRepo.getState(room);
    const currentProgress = parseInt(freshRoomState[progressKey] || '0', 10);
    const newProgress = currentProgress + safeCellsRevealed;
    await roomRepo.setFields(room, { [progressKey]: newProgress.toString() });

    // Broadcast progress to opponent
    await broadcastProgressUpdate(room, socketId, playerIndex, newProgress);

    // Update player score
    if (safeCellsRevealed > 0) {
        const currentScore = parseInt(playerScore || '0', 10) || 0;
        await playerRepo.setScore(socketId, currentScore + safeCellsRevealed);
        await updatePlayerStatsInRoom(room);
    }

    // Save board
    await roomRepo.setPvpBoard(room, playerIndex, board);

    // Check win condition
    await checkWin(board, room, socketId, playerIndex);

    // Send update to this player
    io.to(socketId).emit(SERVER_EVENTS.PVP_UPDATE_CELLS, projectCells(toUpdate));
};

// PVP-specific chord cell
const chordCell = async (row, col, room, socketId, roomState) => {
    const playerData = await playerRepo.getState(socketId);
    const playerIndex = playerIndexOf(playerData, socketId);
    if (playerIndex === null) return;
    const { boardKey, gameOverKey, gameWonKey, progressKey } = playerKeys(playerIndex);

    if (roomState.pvpStarted !== 'true') return;
    if (roomState[gameOverKey] === 'true' || roomState[gameWonKey] === 'true') return;

    const boardData = roomState[boardKey];
    if (!boardData || boardData === '') return;

    let board = JSON.parse(boardData);

    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;
    if (!board[row][col].isOpen) return;

    const adjacentCells = getAdjacentCells(row, col, board);
    const flaggedCells = adjacentCells.filter((adj) => adj.isFlagged).length;
    const toUpdate = [];
    let totalSafeCellsRevealed = 0;

    if (flaggedCells === board[row][col].nearbyMines) {
        for (const adj of adjacentCells) {
            if (!adj.isFlagged && !adj.isOpen) {
                const safeCellsRevealed = await reveal(board, adj.row, adj.col, room, socketId, toUpdate, playerIndex);

                // If mine was hit, safeCellsRevealed will be -1
                if (safeCellsRevealed === -1) {
                    io.to(socketId).emit(SERVER_EVENTS.PVP_UPDATE_CELLS, projectCells(toUpdate));
                    await roomRepo.setPvpBoard(room, playerIndex, board);
                    return;
                }

                totalSafeCellsRevealed += safeCellsRevealed;
            }
        }
    }

    // Update progress tracking
    if (totalSafeCellsRevealed > 0) {
        const currentProgress = parseInt(roomState[progressKey] || '0', 10);
        const newProgress = currentProgress + totalSafeCellsRevealed;
        await roomRepo.setFields(room, { [progressKey]: newProgress.toString() });

        // Broadcast progress to opponent
        await broadcastProgressUpdate(room, socketId, playerIndex, newProgress);

        // Update player score
        const currentScore = await playerRepo.getScore(socketId);
        await playerRepo.setScore(socketId, currentScore + totalSafeCellsRevealed);
    }

    await updatePlayerStatsInRoom(room);
    await checkWin(board, room, socketId, playerIndex);
    io.to(socketId).emit(SERVER_EVENTS.PVP_UPDATE_CELLS, projectCells(toUpdate));
    await roomRepo.setPvpBoard(room, playerIndex, board);
};

// PVP-specific toggle flag
const toggleFlag = async (row, col, room, socketId, roomState) => {
    const playerData = await playerRepo.getState(socketId);
    const playerIndex = playerIndexOf(playerData, socketId);
    if (playerIndex === null) return;
    const { boardKey, gameOverKey, gameWonKey } = playerKeys(playerIndex);

    if (roomState.pvpStarted !== 'true') return;
    if (roomState[gameOverKey] === 'true' || roomState[gameWonKey] === 'true') return;

    const boardData = roomState[boardKey];
    if (!boardData || boardData === '') return;

    const board = JSON.parse(boardData);

    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;
    if (board[row][col] === undefined || !board[row][col] || board[row][col].isOpen) return;

    board[row][col].isFlagged = !board[row][col].isFlagged;

    const toUpdate = [{
        ...board[row][col],
        row,
        col,
    }];

    // The toggled cell is still CLOSED, so projecting keeps a flag from leaking
    // whether that cell is a mine.
    io.to(socketId).emit(SERVER_EVENTS.PVP_UPDATE_CELLS, projectCells(toUpdate));
    await roomRepo.setPvpBoard(room, playerIndex, board);
};

module.exports = { openCell, chordCell, toggleFlag };
