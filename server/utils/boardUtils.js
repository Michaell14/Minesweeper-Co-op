const { generateBoard, checkWin } = require('./gameUtils');
const { updatePlayerStatsInRoom } = require('./playerUtils');
const { io } = require('./initializeClient');
const { redisClient } = require('./initializeRedisClient');

// PVP-specific reveal function - returns number of safe cells revealed
const revealPvp = async (board, r, c, room, socketId, toUpdate, playerIndex) => {
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
            const gameOverKey = `player${playerIndex + 1}GameOver`;
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
const checkWinPvp = async (board, room, socketId, playerIndex) => {
    const client = await redisClient;
    const gameOverKey = `player${playerIndex + 1}GameOver`;
    const gameWonKey = `player${playerIndex + 1}GameWon`;

    const roomState = await client.hGetAll(`room:${room}`);

    // Don't check win if this player already won or lost
    if (roomState[gameOverKey] === 'true' || roomState[gameWonKey] === 'true') {
        return;
    }

    const allNonMinesOpened = board.every((row) =>
        row.every((cell) => (cell.isMine && !cell.isOpen) || (!cell.isMine && cell.isOpen))
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
const openCellPvp = async (row, col, room, socketId, roomState, playerScore, playerData) => {
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
    const boardKey = `player${playerIndex + 1}Board`;
    const initializedKey = `player${playerIndex + 1}Initialized`;
    const gameOverKey = `player${playerIndex + 1}GameOver`;
    const gameWonKey = `player${playerIndex + 1}GameWon`;
    const progressKey = `player${playerIndex + 1}Progress`;

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
    const safeCellsRevealed = await revealPvp(board, row, col, room, socketId, toUpdate, playerIndex);

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
    await checkWinPvp(board, room, socketId, playerIndex);

    // Send update to this player
    if (justInitialized) {
        // Send full board on first click
        io.to(socketId).emit('pvpBoardUpdate', { board, playerIndex });
    } else {
        io.to(socketId).emit('pvpUpdateCells', toUpdate);
    }
};

// PVP-specific chord cell
const chordCellPvp = async (row, col, room, socketId, roomState) => {
    const client = await redisClient;
    const playerData = await client.hGetAll(`player:${socketId}`);
    const playerIndex = parseInt(playerData.pvpPlayerIndex || '0', 10);
    const boardKey = `player${playerIndex + 1}Board`;
    const gameOverKey = `player${playerIndex + 1}GameOver`;
    const gameWonKey = `player${playerIndex + 1}GameWon`;
    const progressKey = `player${playerIndex + 1}Progress`;

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
                const safeCellsRevealed = await revealPvp(board, adj.row, adj.col, room, socketId, toUpdate, playerIndex);

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
    await checkWinPvp(board, room, socketId, playerIndex);
    io.to(socketId).emit('pvpUpdateCells', toUpdate);
    await client.hSet(`room:${room}`, { [boardKey]: JSON.stringify(board) });
};

// PVP-specific toggle flag
const toggleFlagPvp = async (row, col, room, socketId, roomState) => {
    const client = await redisClient;
    const playerData = await client.hGetAll(`player:${socketId}`);
    const playerIndex = parseInt(playerData.pvpPlayerIndex || '0', 10);
    const boardKey = `player${playerIndex + 1}Board`;
    const gameOverKey = `player${playerIndex + 1}GameOver`;
    const gameWonKey = `player${playerIndex + 1}GameWon`;

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

const getAdjacentCells = (row, col, grid) => {
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1],
    ];

    const adjacentCells = [];

    directions.forEach(([dx, dy]) => {
        const newRow = row + dx;
        const newCol = col + dy;

        // Check boundaries
        if (newRow >= 0 && newRow < grid.length && newCol >= 0 && newCol < grid[0].length) {
            adjacentCells.push({
                ...grid[newRow][newCol], // Include cell properties (e.g., isOpen, isFlagged)
                row: newRow,
                col: newCol,
            });
        }
    });

    return adjacentCells;
};

// Reveals a cell to player
const reveal = async (board, r, c, room, socketId, toUpdate) => {
    const client = await redisClient;
    const stack = [[r, c]];

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
            const gameOverName = await client.hGet(`player:${socketId}`, "name");
            io.to(room).emit('gameOver', gameOverName);
            await client.hSet(`room:${room}`, {
                gameOver: 'true',
                gameOverName: gameOverName || 'Unknown'
            });
            return;
        }

        if (board[row][col].nearbyMines === 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    stack.push([row + dr, col + dc]);
                }
            }
        }
    }
};

// Opens a cell
const openCell = async (row, col, room, socketId) => {
    const client = await redisClient;

    // Fetch room state and board in parallel to save time
    const [roomState, playerScore, playerData] = await Promise.all([
        client.hGetAll(`room:${room}`),
        client.hGet(`player:${socketId}`, "score"), // Retrieves the player score to later increment it
        client.hGetAll(`player:${socketId}`),
    ]);

    const mode = roomState.mode || 'co-op';

    // If PVP mode, route to PVP handler
    if (mode === 'pvp') {
        return await openCellPvp(row, col, room, socketId, roomState, playerScore, playerData);
    }

    // Return when game is over -> no more interactions necessary
    if (roomState.gameOver === 'true' || roomState.gameWon === 'true') {
        return;
    }

    // Parse board only if necessary
    let board = JSON.parse(roomState.board);

    // Validate bounds first before accessing array
    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;

    // Check invalid scenarios with board state
    if (
        board[row][col] === undefined ||
        !board[row][col] ||
        board[row][col].isOpen ||
        board[row][col].isFlagged
    ) return;

    const numRows = parseInt(roomState.numRows, 10);
    const numCols = parseInt(roomState.numCols, 10);
    const numMines = parseInt(roomState.numMines, 10);
    let justInitialized = false;

    // Initialize board if not already initialized (with race condition protection)
    if (roomState.initialized === 'false') {
        // Use Redis SET NX: check and set atomically
        // This prevents race condition where two players initialize simultaneously
        const initLockKey = `init_lock:${room}`;
        const lockAcquired = await client.set(initLockKey, socketId, {
            NX: true, // Only set if doesn't exist
            EX: 10    // Expire after 10 seconds (timeout protection)
        });

        if (lockAcquired) {
            // Double-check after acquiring lock to prevent race condition
            const freshState = await client.hGet(`room:${room}`, 'initialized');
            if (freshState === 'true') {
                // Someone else initialized while we were waiting for the lock
                await client.del(initLockKey);
                const updatedBoard = await client.hGet(`room:${room}`, 'board');
                board = JSON.parse(updatedBoard);
            } else {
                // We can safely initialize
                board = generateBoard(numRows, numCols, numMines, row, col);
                await client.hSet(`room:${room}`, {
                    initialized: 'true',
                    board: JSON.stringify(board)
                });
                await client.del(initLockKey); // Release lock
                justInitialized = true;
            }
        } else {
            // Another player is initializing, wait and reload
            // Poll for completion (max 5 attempts with 100ms delay)
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                const currentState = await client.hGet(`room:${room}`, 'initialized');
                if (currentState === 'true') {
                    const updatedBoard = await client.hGet(`room:${room}`, 'board');
                    board = JSON.parse(updatedBoard);
                    break;
                }
            }
            // Don't award score for this click since we didn't initialize
        }
    } else if (!board[row][col].isMine) {
        // Update player score in a single database operation
        const currentScore = parseInt(playerScore || '0', 10) || 0;
        const newScore = currentScore + 1;
        await client.hSet(`player:${socketId}`, { score: newScore.toString() });
        await updatePlayerStatsInRoom(room);
    }

    // Reveal cells and update board state
    const toUpdate = [];
    await reveal(board, row, col, room, socketId, toUpdate);

    // Save board first before checking win condition
    await client.hSet(`room:${room}`, { board: JSON.stringify(board) });

    // Refresh room state to get latest gameOver/gameWon status before checking win
    const freshRoomState = await client.hGetAll(`room:${room}`);
    checkWin(freshRoomState, board, room);

    if (justInitialized) {
        io.to(room).emit("boardUpdate", board);
    } else {
        io.to(room).emit('updateCells', toUpdate);
    }
};

const chordCell = async (row, col, room, socketId) => {
    const client = await redisClient;
    const roomState = await client.hGetAll(`room:${room}`);

    const mode = roomState.mode || 'co-op';

    // If PVP mode, route to PVP handler
    if (mode === 'pvp') {
        return await chordCellPvp(row, col, room, socketId, roomState);
    }

    if (roomState === undefined || !roomState || roomState.gameOver === 'true' || roomState.gameWon === 'true') {
        return;
    }
    if (roomState.board === undefined || !roomState.board) {
        return;
    }
    let board = JSON.parse(roomState.board);

    // Validate bounds first before accessing array
    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;

    // Chord should only work on already-opened cells
    if (!board[row][col].isOpen) return;

    const adjacentCells = getAdjacentCells(row, col, board);
    // Count the number of flagged cells
    const flaggedCells = adjacentCells.filter((adj) => adj.isFlagged).length;
    const toUpdate = [];

    // If the number of flagged cells matches the number on the cell, proceed
    if (flaggedCells === board[row][col].nearbyMines) {
        // Open all adjacent cells that are not flagged and not already open
        for (const adj of adjacentCells) {
            if (!adj.isFlagged && !adj.isOpen) {
                const beforeLength = toUpdate.length;
                await reveal(board, adj.row, adj.col, room, socketId, toUpdate);

                // Check if game ended (hit a mine)
                const gameOverStatus = await client.hGet(`room:${room}`, "gameOver");
                if (gameOverStatus === 'true') {
                    // Game ended, emit updates but don't award points
                    io.to(room).emit("updateCells", toUpdate);
                    await client.hSet(`room:${room}`, { board: JSON.stringify(board) });
                    return;
                }

                // Calculate score increase based on actual cells opened (not mines)
                const cellsOpened = toUpdate.slice(beforeLength);
                const scoreIncrease = cellsOpened.filter(cell => !cell.isMine).length;

                // Update player score incrementally
                if (scoreIncrease > 0) {
                    const currentScore = parseInt(await client.hGet(`player:${socketId}`, "score") || '0', 10) || 0;
                    const newScore = currentScore + scoreIncrease;
                    await client.hSet(`player:${socketId}`, { score: newScore.toString() });
                }
            }
        }
    }

    await updatePlayerStatsInRoom(room);
    checkWin(roomState, board, room);
    io.to(room).emit("updateCells", toUpdate);
    await client.hSet(`room:${room}`, { board: JSON.stringify(board) });
}

const toggleFlag = async (row, col, room, socketId) => {
    const client = await redisClient;
    // Check if room exists and fetch its state in a single call
    const roomState = await client.hGetAll(`room:${room}`);

    const mode = roomState.mode || 'co-op';

    // If PVP mode, route to PVP handler
    if (mode === 'pvp') {
        return await toggleFlagPvp(row, col, room, socketId, roomState);
    }

    if (!roomState || !roomState.board || roomState.gameOver === 'true' || roomState.gameWon === 'true') return;

    const board = JSON.parse(roomState.board);

    // Validate bounds first before accessing array
    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;

    // Exit early if the cell is already open
    if (board[row][col] === undefined || !board[row][col] || board[row][col].isOpen) return;

    // Toggle the flag
    board[row][col].isFlagged = !board[row][col].isFlagged;

    // Prepare the update for broadcasting
    const toUpdate = [{
        ...board[row][col],
        row,
        col,
    }];

    // Emit the cell update and update the board in Redis
    io.to(room).emit('updateCells', toUpdate);
    await client.hSet(`room:${room}`, { board: JSON.stringify(board) });
}

module.exports = { openCell, chordCell, toggleFlag };