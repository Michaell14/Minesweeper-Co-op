/**
 * PVP mode: two players race on their own separate boards.
 *
 * Everything is addressed per player — board state lives under player1Board /
 * player2Board, and updates go to a single socket rather than the room.
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
const { recordForSockets, boardKeyOf } = require('../utils/statsRecorder');
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

/**
 * Stops one player's clock. Sent to that socket alone and never written to room
 * state — the opponent's clock must keep running. The start still comes from the
 * room, which is why it is read back rather than invented here.
 */
const stopFor = async (room, socketId) => {
    const startedAt = readStamp(await roomRepo.getField(room, 'startedAt'));
    io.to(socketId).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt, endedAt: Date.now() });
};

/**
 * Stops the clock for BOTH players, because a winner ends the race for both.
 *
 * The loser's is the easy one to forget: they are still mid-board, so nothing on
 * their side ends. Left running, their timer counts on under a dialog saying the
 * game is over, and the summary has no finish time to show.
 */
const stopRace = async (room) => {
    const startedAt = readStamp(await roomRepo.getField(room, 'startedAt'));
    io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt, endedAt: Date.now() });
};

/**
 * Reveals cells from (r, c) on ONE player's board. Hitting a mine ends the game
 * for that player only; the opponent keeps playing and is told they failed.
 *
 * Returns the number of safe cells revealed, or -1 if a mine was hit.
 */
const reveal = async (board, r, c, room, socketId, toUpdate, playerIndex) => {
    const { hitMine, cellsRevealed } = revealFrom(board, r, c, toUpdate);
    if (!hitMine) return cellsRevealed;

    const { gameOverKey } = playerKeys(playerIndex);
    await roomRepo.setFields(room, { [gameOverKey]: 'true' });

    await stopFor(room, socketId);
    io.to(socketId).emit(SERVER_EVENTS.PVP_GAME_OVER);

    /*
     * Deliberately NOT revealMines, unlike co-op and the daily.
     *
     * A PVP loss is not terminal: `resetMyBoard` puts this player back on the
     * SAME shared layout to carry on racing. Revealing here therefore handed
     * them the answer key mid-race -- die on the second click, read all ten
     * mines, reset, clear the board with perfect knowledge, take the win off an
     * opponent who was playing it straight. Reproduced end to end.
     *
     * They still see where they died: `revealFrom` opens the mine it hits, and
     * projection tells the truth about open cells, so that one is visible and
     * the rest are not. The whole board arrives at the moment the race is
     * actually decided -- see `revealToLoser`.
     */
    io.to(socketId).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
        board: projectBoard(board),
        playerIndex,
    });

    const opponentSocket = await roomRepo.opponentOf(room, socketId);
    if (opponentSocket) {
        io.to(opponentSocket).emit(SERVER_EVENTS.PVP_OPPONENT_FAILED);
    }
    return -1;
};

const broadcastProgressUpdate = async (room, socketId, newProgress) => {
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

/**
 * Whether the race is already decided. The winner's own flags stop THEM, but
 * nothing stopped the other player: their `gameOver`/`gameWon` are both still
 * false, so they could carry on opening cells on a board whose race had ended,
 * broadcasting progress into a game nobody was watching — and, since the loss
 * now reveals their board, doing it with every mine on screen.
 */
const raceIsOver = (roomState) => Boolean(roomState.winnerSocket);

/**
 * Shows the loser the board they were racing on.
 *
 * This is the ONLY place a PVP board is revealed, and the reason is that this
 * is the only moment a PVP game is genuinely over. Detonating is not: that
 * player can `resetMyBoard` and keep racing the same layout, which is why the
 * reveal there was an exploit rather than a courtesy.
 *
 * Their own board, not the winner's — the two have diverged through play, and
 * projection is allowed to reveal it only because the race is now over for them
 * too (ARCHITECTURE.md §3.1).
 */
const revealToLoser = async (room, winnerSocketId) => {
    const roomState = await roomRepo.getState(room);

    // Found through the SLOTS, not the players list: the slot is what owns the
    // board being revealed, so asking anything else for "the other player" is
    // two sources for one answer.
    const winnerSlot = roomRepo.pvpSlotOf(roomState, winnerSocketId);
    if (winnerSlot === undefined) return;

    const loserSlot = winnerSlot === 0 ? 1 : 0;
    const { boardKey, socketKey } = playerKeys(loserSlot);
    const loserSocket = roomState[socketKey];
    const boardData = roomState[boardKey];
    if (!loserSocket || !boardData) return;

    io.to(loserSocket).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
        board: projectBoard(JSON.parse(boardData), { revealMines: true }),
        playerIndex: loserSlot,
    });
};

/** Won iff every non-mine cell on THIS player's board is open. */
const checkWin = async (board, room, socketId, playerIndex) => {
    const { gameOverKey, gameWonKey } = playerKeys(playerIndex);

    const roomState = await roomRepo.getState(room);
    if (roomState[gameOverKey] === 'true' || roomState[gameWonKey] === 'true') {
        return;
    }

    const allNonMinesOpened = board.every((row) =>
        row.every((cell) => cell.isMine || cell.isOpen)
    );

    if (allNonMinesOpened) {
        const winnerSocket = roomState.winnerSocket;

        if (!winnerSocket || winnerSocket === '') {
            // First to finish — the lock decides it when both land at once.
            const lockAcquired = await roomRepo.acquireWinnerLock(room, socketId);

            if (lockAcquired) {
                await roomRepo.setFields(room, {
                    [gameWonKey]: 'true',
                    winnerSocket: socketId
                });
                await stopRace(room);

                const playerName = await playerRepo.getName(socketId);

                io.to(room).emit(SERVER_EVENTS.PVP_PLAYER_WON, {
                    winnerSocket: socketId,
                    winnerName: playerName
                });

                await revealToLoser(room, socketId);

                // A decided race is a game for BOTH racers' stats: a win for
                // this socket, a loss for the other slot. Forfeits (opponent
                // disconnected) deliberately record nothing — that game was
                // never played out. Fire-and-forget.
                try {
                    const winnerSlot = roomRepo.pvpSlotOf(roomState, socketId);
                    const loserSocket =
                        winnerSlot === undefined
                            ? null
                            : roomState[playerKeys(winnerSlot === 0 ? 1 : 0).socketKey];
                    const endedAt = Date.now();
                    const startedAt = readStamp(roomState.startedAt);
                    const shared = {
                        mode: 'pvp',
                        boardKey: boardKeyOf(board, 'pvp', 2),
                        durationMs: startedAt === null ? null : endedAt - startedAt,
                        players: 2,
                        finishedAt: endedAt,
                    };
                    recordForSockets([socketId], { ...shared, won: true });
                    if (loserSocket) recordForSockets([loserSocket], { ...shared, won: false });
                } catch (error) {
                    console.error('Stats write dropped:', error.message);
                }

                await roomRepo.releaseWinnerLock(room);
            }
        } else {
            // Someone else already won, so `stopRace` stopped this player's clock
            // when the race actually ended. Stamping it again would push their
            // finish out to whenever they filled in the rest of their board.
            await roomRepo.setFields(room, { [gameWonKey]: 'true' });
        }
    }
};

const openCell = async (row, col, room, socketId, roomState, playerScore, playerData) => {
    if (roomState.pvpStarted !== 'true') {
        return;
    }

    const playerIndex = playerIndexOf(playerData, socketId);
    if (playerIndex === null) return;
    const { boardKey, initializedKey, gameOverKey, gameWonKey, progressKey } = playerKeys(playerIndex);

    if (raceIsOver(roomState) || roomState[gameOverKey] === 'true' || roomState[gameWonKey] === 'true') {
        return;
    }

    const numRows = parseInt(roomState.numRows, 10);
    const numCols = parseInt(roomState.numCols, 10);
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

    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (
        board[row][col] === undefined ||
        !board[row][col] ||
        board[row][col].isOpen ||
        board[row][col].isFlagged
    ) return;

    const toUpdate = [];
    const safeCellsRevealed = await reveal(board, row, col, room, socketId, toUpdate, playerIndex);

    if (safeCellsRevealed === -1) {
        await roomRepo.setPvpBoard(room, playerIndex, board);
        io.to(socketId).emit(SERVER_EVENTS.PVP_UPDATE_CELLS, projectCells(toUpdate));
        return;
    }

    // Re-read: `reveal` may have written to the room since the snapshot was taken.
    const freshRoomState = await roomRepo.getState(room);
    const currentProgress = parseInt(freshRoomState[progressKey] || '0', 10);
    const newProgress = currentProgress + safeCellsRevealed;
    await roomRepo.setFields(room, { [progressKey]: newProgress.toString() });

    await broadcastProgressUpdate(room, socketId, newProgress);

    if (safeCellsRevealed > 0) {
        const currentScore = parseInt(playerScore || '0', 10) || 0;
        await playerRepo.setScore(socketId, currentScore + safeCellsRevealed);
        await updatePlayerStatsInRoom(room);
    }

    await roomRepo.setPvpBoard(room, playerIndex, board);
    await checkWin(board, room, socketId, playerIndex);
    io.to(socketId).emit(SERVER_EVENTS.PVP_UPDATE_CELLS, projectCells(toUpdate));
};

const chordCell = async (row, col, room, socketId, roomState) => {
    const playerData = await playerRepo.getState(socketId);
    const playerIndex = playerIndexOf(playerData, socketId);
    if (playerIndex === null) return;
    const { boardKey, gameOverKey, gameWonKey, progressKey } = playerKeys(playerIndex);

    if (roomState.pvpStarted !== 'true') return;
    if (raceIsOver(roomState) || roomState[gameOverKey] === 'true' || roomState[gameWonKey] === 'true') return;

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

                if (safeCellsRevealed === -1) {
                    io.to(socketId).emit(SERVER_EVENTS.PVP_UPDATE_CELLS, projectCells(toUpdate));
                    await roomRepo.setPvpBoard(room, playerIndex, board);
                    return;
                }

                totalSafeCellsRevealed += safeCellsRevealed;
            }
        }
    }

    if (totalSafeCellsRevealed > 0) {
        const currentProgress = parseInt(roomState[progressKey] || '0', 10);
        const newProgress = currentProgress + totalSafeCellsRevealed;
        await roomRepo.setFields(room, { [progressKey]: newProgress.toString() });

        await broadcastProgressUpdate(room, socketId, newProgress);

        const currentScore = await playerRepo.getScore(socketId);
        await playerRepo.setScore(socketId, currentScore + totalSafeCellsRevealed);
    }

    await updatePlayerStatsInRoom(room);
    await checkWin(board, room, socketId, playerIndex);
    io.to(socketId).emit(SERVER_EVENTS.PVP_UPDATE_CELLS, projectCells(toUpdate));
    await roomRepo.setPvpBoard(room, playerIndex, board);
};

const toggleFlag = async (row, col, room, socketId, roomState) => {
    const playerData = await playerRepo.getState(socketId);
    const playerIndex = playerIndexOf(playerData, socketId);
    if (playerIndex === null) return;
    const { boardKey, gameOverKey, gameWonKey } = playerKeys(playerIndex);

    if (roomState.pvpStarted !== 'true') return;
    if (raceIsOver(roomState) || roomState[gameOverKey] === 'true' || roomState[gameWonKey] === 'true') return;

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
