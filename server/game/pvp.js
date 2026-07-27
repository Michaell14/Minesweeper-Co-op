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
const { getAdjacentCells } = require('../domain/board');
const { io } = require('../utils/initializeClient');
const { redisClient } = require('../utils/initializeRedisClient');

/** Per-player Redis field names for a given zero-based player index. */
const playerKeys = (playerIndex) => ({
    boardKey: `player${playerIndex + 1}Board`,
    initializedKey: `player${playerIndex + 1}Initialized`,
    gameOverKey: `player${playerIndex + 1}GameOver`,
    gameWonKey: `player${playerIndex + 1}GameWon`,
    progressKey: `player${playerIndex + 1}Progress`,
});

// PVP-specific reveal function - returns number of safe cells revealed
const reveal = async (board, r, c, room, socketId, toUpdate, playerIndex) => {
    const client = await redisClient;
    const stack = [[r, c]];
    let safeCellsRevealed = 0;

    // Iteratively reveals open cells
    while (stack.length > 0) {
        const [row, col] = stack.pop();

        if (row < 0 || row >= board.length || col < 0 || col >= board[0].length || board[row][col].isOpen || board[row][col].isFlagged) continue;

        board[row][col].isOpen = true;
        toUpdate.push({
            ...board[row][col],
            row: row,
            col: col,
        });

        if (board[row][col].isMine) {
            const { gameOverKey } = playerKeys(playerIndex);
            await client.hSet(`room:${room}`, { [gameOverKey]: 'true' });

            // Notify this player they lost
            io.to(socketId).emit('pvpGameOver');

            // Notify opponent with updated progress info
            const players = JSON.parse(await client.hGet(`room:${room}`, 'players') || '[]');
            const opponentSocket = players.find(p => p !== socketId);
            if (opponentSocket) {
                io.to(opponentSocket).emit('pvpOpponentFailed');
            }
            return -1; // Signal that mine was hit
        }

        // Count safe cell revealed
        safeCellsRevealed++;

        if (board[row][col].nearbyMines === 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    stack.push([row + dr, col + dc]);
                }
            }
        }
    }

    return safeCellsRevealed;
};

// Broadcast progress update to opponent
const broadcastProgressUpdate = async (room, socketId, playerIndex, newProgress) => {
    const client = await redisClient;
    const players = JSON.parse(await client.hGet(`room:${room}`, 'players') || '[]');
    const opponentSocket = players.find(p => p !== socketId);

    if (opponentSocket) {
        const totalSafeCells = parseInt(await client.hGet(`room:${room}`, 'totalSafeCells') || '0', 10);
        io.to(opponentSocket).emit('pvpOpponentProgress', {
            progress: newProgress,
            totalSafeCells,
            percentage: totalSafeCells > 0 ? Math.round((newProgress / totalSafeCells) * 100) : 0
        });
    }
};

// Check win for PVP
const checkWin = async (board, room, socketId, playerIndex) => {
    const client = await redisClient;
    const { gameOverKey, gameWonKey } = playerKeys(playerIndex);

    const roomState = await client.hGetAll(`room:${room}`);

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
            const lockAcquired = await client.set(`winner_lock:${room}`, socketId, {
                NX: true,
                EX: 10
            });

            if (lockAcquired) {
                await client.hSet(`room:${room}`, {
                    [gameWonKey]: 'true',
                    winnerSocket: socketId
                });

                const playerName = await client.hGet(`player:${socketId}`, 'name');

                // Notify both players
                io.to(room).emit('pvpPlayerWon', {
                    winnerSocket: socketId,
                    winnerName: playerName
                });

                await client.del(`winner_lock:${room}`);
            }
        } else {
            // Someone else already won
            await client.hSet(`room:${room}`, { [gameWonKey]: 'true' });
        }
    }
};

// PVP-specific open cell
const openCell = async (row, col, room, socketId, roomState, playerScore, playerData) => {
    const client = await redisClient;

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
        const initLockKey = `init_lock_pvp:${room}:${playerIndex}`;
        const lockAcquired = await client.set(initLockKey, socketId, {
            NX: true,
            EX: 10
        });

        if (lockAcquired) {
            // Double-check initialization state
            const freshState = await client.hGet(`room:${room}`, initializedKey);
            if (freshState === 'true') {
                // Already initialized by another request
                await client.del(initLockKey);
                const updatedBoard = await client.hGet(`room:${room}`, boardKey);
                board = JSON.parse(updatedBoard);
            } else {
                // Generate new board with first click excluded from mines (safe 3x3 zone)
                board = generateBoard(numRows, numCols, numMines, row, col);

                // Save the initialized board
                await client.hSet(`room:${room}`, {
                    [initializedKey]: 'true',
                    [boardKey]: JSON.stringify(board)
                });
                await client.del(initLockKey);
                justInitialized = true;
            }
        } else {
            // Wait for initialization to complete
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                const currentState = await client.hGet(`room:${room}`, initializedKey);
                if (currentState === 'true') {
                    const updatedBoard = await client.hGet(`room:${room}`, boardKey);
                    board = JSON.parse(updatedBoard);
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
        await client.hSet(`room:${room}`, { [boardKey]: JSON.stringify(board) });
        io.to(socketId).emit('pvpUpdateCells', toUpdate);
        return;
    }

    // Update progress tracking - need to get fresh state since board may have just been initialized
    const freshRoomState = await client.hGetAll(`room:${room}`);
    const currentProgress = parseInt(freshRoomState[progressKey] || '0', 10);
    const newProgress = currentProgress + safeCellsRevealed;
    await client.hSet(`room:${room}`, { [progressKey]: newProgress.toString() });

    // Broadcast progress to opponent
    await broadcastProgressUpdate(room, socketId, playerIndex, newProgress);

    // Update player score
    if (safeCellsRevealed > 0) {
        const currentScore = parseInt(playerScore || '0', 10) || 0;
        const newScore = currentScore + safeCellsRevealed;
        await client.hSet(`player:${socketId}`, { score: newScore.toString() });
        await updatePlayerStatsInRoom(room);
    }

    // Save board
    await client.hSet(`room:${room}`, { [boardKey]: JSON.stringify(board) });

    // Check win condition
    await checkWin(board, room, socketId, playerIndex);

    // Send update to this player
    if (justInitialized) {
        // Send full board on first click
        io.to(socketId).emit('pvpBoardUpdate', { board, playerIndex });
    } else {
        io.to(socketId).emit('pvpUpdateCells', toUpdate);
    }
};

// PVP-specific chord cell
const chordCell = async (row, col, room, socketId, roomState) => {
    const client = await redisClient;
    const playerData = await client.hGetAll(`player:${socketId}`);
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
                    io.to(socketId).emit('pvpUpdateCells', toUpdate);
                    await client.hSet(`room:${room}`, { [boardKey]: JSON.stringify(board) });
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
        await client.hSet(`room:${room}`, { [progressKey]: newProgress.toString() });

        // Broadcast progress to opponent
        await broadcastProgressUpdate(room, socketId, playerIndex, newProgress);

        // Update player score
        const currentScore = parseInt(await client.hGet(`player:${socketId}`, "score") || '0', 10) || 0;
        const newScore = currentScore + totalSafeCellsRevealed;
        await client.hSet(`player:${socketId}`, { score: newScore.toString() });
    }

    await updatePlayerStatsInRoom(room);
    await checkWin(board, room, socketId, playerIndex);
    io.to(socketId).emit('pvpUpdateCells', toUpdate);
    await client.hSet(`room:${room}`, { [boardKey]: JSON.stringify(board) });
};

// PVP-specific toggle flag
const toggleFlag = async (row, col, room, socketId, roomState) => {
    const client = await redisClient;
    const playerData = await client.hGetAll(`player:${socketId}`);
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

    io.to(socketId).emit('pvpUpdateCells', toUpdate);
    await client.hSet(`room:${room}`, { [boardKey]: JSON.stringify(board) });
};

module.exports = { playerKeys, reveal, broadcastProgressUpdate, checkWin, openCell, chordCell, toggleFlag };
