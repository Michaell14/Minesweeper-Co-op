/**
 * PVP mode: two players race on their own separate boards.
 *
 * Everything is addressed per player. Board state lives under player1Board /
 * player2Board (see ARCHITECTURE.md for the full room schema), and updates are
 * emitted to a single socket rather than the room. Progress is broadcast to the
 * opponent as a count of revealed safe cells.
 *
 * NOTE: each player's board is generated independently on their own first click,
 * so the two players do NOT race the same mine layout. See ARCHITECTURE.md §7.
 *
 * Lifecycle events (start, reset, rematch) live in controllers/pvpController.js.
 */

const { generateBoard } = require('../utils/gameUtils');
const { updatePlayerStatsInRoom } = require('../utils/playerUtils');
const { getAdjacentCells, revealFrom, projectBoard, projectCells } = require('../domain/board');
const { io } = require('../utils/initializeClient');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { pvpPlayerFields: playerKeys } = require('../data/keys');

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
    io.to(socketId).emit('pvpGameOver');

    // This player's game is over, so reveal their mines -- to them only. The
    // opponent is still playing on their own board and learns nothing.
    io.to(socketId).emit('pvpBoardUpdate', {
        board: projectBoard(board, { revealMines: true }),
        playerIndex,
    });

    // Notify opponent with updated progress info
    const opponentSocket = await roomRepo.opponentOf(room, socketId);
    if (opponentSocket) {
        io.to(opponentSocket).emit('pvpOpponentFailed');
    }
    return -1; // Signal that mine was hit
};

// Broadcast progress update to opponent
const broadcastProgressUpdate = async (room, socketId, playerIndex, newProgress) => {
    const opponentSocket = await roomRepo.opponentOf(room, socketId);

    if (opponentSocket) {
        const totalSafeCells = parseInt(await roomRepo.getField(room, 'totalSafeCells') || '0', 10);
        io.to(opponentSocket).emit('pvpOpponentProgress', {
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

                const playerName = await playerRepo.getName(socketId);

                // Notify both players
                io.to(room).emit('pvpPlayerWon', {
                    winnerSocket: socketId,
                    winnerName: playerName
                });

                await roomRepo.releaseWinnerLock(room);
            }
        } else {
            // Someone else already won
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
    if (!playerData.pvpPlayerIndex) {
        console.error(`Player ${socketId} has no pvpPlayerIndex set!`);
        return;
    }

    const playerIndex = parseInt(playerData.pvpPlayerIndex, 10);
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

    let board;
    let justInitialized = false;

    // Check if board needs to be initialized (first click)
    if (roomState[initializedKey] !== 'true') {
        // Use a lock to prevent race conditions on first click
        const lockAcquired = await roomRepo.acquirePvpInitLock(room, playerIndex, socketId);

        if (lockAcquired) {
            // Double-check initialization state
            const freshState = await roomRepo.getField(room, initializedKey);
            if (freshState === 'true') {
                // Already initialized by another request
                await roomRepo.releasePvpInitLock(room, playerIndex);
                board = await roomRepo.getPvpBoard(room, playerIndex);
            } else {
                // Generate new board with first click excluded from mines (safe 3x3 zone)
                board = generateBoard(numRows, numCols, numMines, row, col);

                // Save the initialized board
                await roomRepo.setFields(room, {
                    [initializedKey]: 'true',
                    [boardKey]: JSON.stringify(board)
                });
                await roomRepo.releasePvpInitLock(room, playerIndex);
                justInitialized = true;
            }
        } else {
            // Wait for initialization to complete
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                const currentState = await roomRepo.getField(room, initializedKey);
                if (currentState === 'true') {
                    board = await roomRepo.getPvpBoard(room, playerIndex);
                    break;
                }
            }
            if (!board) {
                console.error(`[PVP] Failed to get initialized board for player ${playerIndex}`);
                return;
            }
        }
    } else {
        // Board already initialized, get it
        const boardData = roomState[boardKey];
        if (!boardData || boardData === '') {
            console.error(`[PVP] Board data missing for player ${playerIndex}`);
            return;
        }
        board = JSON.parse(boardData);
    }

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
        io.to(socketId).emit('pvpUpdateCells', projectCells(toUpdate));
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
    if (justInitialized) {
        // Send full board on first click
        io.to(socketId).emit('pvpBoardUpdate', { board: projectBoard(board), playerIndex });
    } else {
        io.to(socketId).emit('pvpUpdateCells', projectCells(toUpdate));
    }
};

// PVP-specific chord cell
const chordCell = async (row, col, room, socketId, roomState) => {
    const playerData = await playerRepo.getState(socketId);
    const playerIndex = parseInt(playerData.pvpPlayerIndex || '0', 10);
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
                    io.to(socketId).emit('pvpUpdateCells', projectCells(toUpdate));
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
    io.to(socketId).emit('pvpUpdateCells', projectCells(toUpdate));
    await roomRepo.setPvpBoard(room, playerIndex, board);
};

// PVP-specific toggle flag
const toggleFlag = async (row, col, room, socketId, roomState) => {
    const playerData = await playerRepo.getState(socketId);
    const playerIndex = parseInt(playerData.pvpPlayerIndex || '0', 10);
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
    io.to(socketId).emit('pvpUpdateCells', projectCells(toUpdate));
    await roomRepo.setPvpBoard(room, playerIndex, board);
};

module.exports ={ playerKeys, reveal, broadcastProgressUpdate, checkWin, openCell, chordCell, toggleFlag };
