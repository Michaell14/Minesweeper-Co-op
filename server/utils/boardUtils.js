const { generateBoard, checkWin } = require('./gameUtils');
const { updatePlayerNamesInRoom } = require('./playerUtils');
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

const reveal = async (board, r, c, room, socketId, toUpdate) => {
    const client = await redisClient;
    const stack = [[r, c]];

    while (stack.length > 0) {
        const [row, col] = stack.pop();

        if (row < 0 || row >= board.length || col < 0 || col >= board[0].length || board[row][col].isOpen) continue;

        board[row][col].isOpen = true;
        toUpdate.push({
            ...board[row][col],
            row: row,
            col: col,
        });

        if (board[row][col].isMine) {
            const gameOverName = await client.hGet(`player:${socketId}`, "name");
            io.to(room).emit('gameOver', gameOverName);
            await client.hSet(`room:${room}`, { gameOver: 'true' });
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

const openCell = async (row, col, room, socketId) => {
    const client = await redisClient;
    // Fetch room state and board in parallel to save time
    const [roomState, playerScore] = await Promise.all([
        client.hGetAll(`room:${room}`),
        client.hGet(`player:${socketId}`, "score"),
    ]);

    // Parse board only if necessary
    let board = JSON.parse(roomState.board);

    // Check invalid scenarios early to return immediately
    if (
        roomState.gameOver === 'true' ||
        roomState.gameWon === 'true' ||
        board === undefined ||
        !board ||
        board[row][col] === undefined ||
        !board[row][col] ||
        board[row][col].isOpen ||
        board[row][col].isFlagged
    ) return;

    const numRows = parseInt(roomState.numRows);
    const numCols = parseInt(roomState.numCols);
    const numMines = parseInt(roomState.numMines);
    let justInitialized = false;
    // Initialize board if not already initialized
    if (roomState.initialized === 'false') {
        board = generateBoard(numRows, numCols, numMines, row, col);
        await client.hSet(`room:${room}`, {
            initialized: 'true',
            board: JSON.stringify(board)
        });
        justInitialized = true;
    } else if (!board[row][col].isMine) {
        // Update player score in a single database operation
        const newScore = parseInt(playerScore || '0') + 1;
        await client.hSet(`player:${socketId}`, { score: newScore.toString() });
        updatePlayerNamesInRoom(room); // Consider making this function asynchronous
    }

    // Reveal cells and update board state
    const toUpdate = [];
    reveal(board, row, col, room, socketId, toUpdate);

    // Check for game win condition
    checkWin(roomState, board, room);

    // Batch board and updateCells operations together
    await client.hSet(`room:${room}`, { board: JSON.stringify(board) });

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

    const adjacentCells = getAdjacentCells(row, col, board);
    // Count the number of flagged cells
    const flaggedCells = adjacentCells.filter((adj) => adj.isFlagged).length;
    let scoreIncrease = 0;
    const toUpdate = [];
    // If the number of flagged cells matches the number on the cell, proceed
    if (flaggedCells === board[row][col].nearbyMines) {
        // Open all adjacent cells that are not flagged and not already open
        adjacentCells.forEach((adj) => {
            if (!adj.isFlagged && !adj.isOpen) {
                reveal(board, adj.row, adj.col, room, socketId, toUpdate);
                if (!adj.isMine) {
                    scoreIncrease += 1;
                }
            }
        });
    }

    // Updating player score
    const newScore = parseInt(await client.hGet(`player:${socketId}`, "score")) + scoreIncrease;
    await client.hSet(`player:${socketId}`, { score: newScore.toString() })
    updatePlayerNamesInRoom(room);

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
    
    // Exit early if the cell is already open
    if (!board || board[row][col] === undefined || !board[row][col] || board[row][col].isOpen) return;

    // Toggle the flag
    board[row][col].isFlagged = !board[row][col].isFlagged;

    // Prepare the update for broadcasting
    const toUpdate = [{
        row,
        col,
        ...board[row][col]
    }];

    // Emit the cell update and update the board in Redis
    io.to(room).emit('updateCells', toUpdate);
    await client.hSet(`room:${room}`, { board: JSON.stringify(board) });
}

module.exports = { reveal, getAdjacentCells, openCell, chordCell, toggleFlag };