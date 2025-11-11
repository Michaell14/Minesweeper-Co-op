const { generateBoard, checkWin } = require('./gameUtils');
const { updatePlayerStatsInRoom } = require('./playerUtils');
const { io } = require('./initializeClient');
const { redisClient } = require('./initializeRedisClient');

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
    const [roomState, playerScore] = await Promise.all([
        client.hGetAll(`room:${room}`),
        client.hGet(`player:${socketId}`, "score"), // Retrieves the player score to later increment it
    ]);

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

const toggleFlag = async (row, col, room) => {
    const client = await redisClient;
    // Check if room exists and fetch its state in a single call
    const roomState = await client.hGetAll(`room:${room}`);
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

module.exports = { reveal, getAdjacentCells, openCell, chordCell, toggleFlag };