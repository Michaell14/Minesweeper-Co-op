const { addPlayerToRoom, resetPlayerScores, updatePlayerStatsInRoom } = require('./playerUtils');
const { io } = require('./initializeClient');
const { redisClient } = require('./initializeRedisClient');

// Utility function to generate a board
// Checked
const generateBoard = (numRows, numCols, numMines, excludeRow, excludeCol) => {
    const board = Array(numRows)
        .fill(null)
        .map(() =>
            Array(numCols).fill({
                isMine: false,
                isOpen: false,
                isFlagged: false,
                nearbyMines: 0,
            })
        );

    let placedMines = 0;

    // Randomly placing mines on the board
    while (placedMines < numMines) {
        const row = Math.floor(Math.random() * numRows);
        const col = Math.floor(Math.random() * numCols);

        if (
            !board[row][col].isMine &&
            
            // wtf is this thing checkin
            !(row >= excludeRow - 1 && row <= excludeRow + 1 && col >= excludeCol - 1 && col <= excludeCol + 1)

            // test this later:
            // row != excludeRow &&
            // col != excludeCol
        ) {
            board[row][col] = { 
                ...board[row][col],
                isMine: true
            };
            placedMines++;
        }
    }

    // For each cell, calculating the number of mines in its 3x3 perimeter
    // Runtime: O(n^2)
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            if (!board[r][c].isMine) {
                let count = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < numRows && nc >= 0 && nc < numCols && board[nr][nc].isMine) {
                            count++;
                        }
                    }
                }
                board[r][c] = { 
                    ...board[r][c],
                    nearbyMines: count
                };
            }
        }
    }

    return board;
};

const checkWin = async (roomState, board, room) => {
    if (roomState.gameOver === 'true') {
        return;
    }
    const allNonMinesOpened = board.every((row) =>
        row.every((cell) => (cell.isMine && !cell.isOpen) || (!cell.isMine && cell.isOpen))
    );

    if (allNonMinesOpened) {
        const client = await redisClient;
        await client.hSet(`room:${room}`, { gameWon: 'true' });
        io.to(room).emit('gameWon');
    }
}

// Note that Object properties set in redis must be string
// ROOM PROPERTIES:
// gameOver
// gameWon
// initialized
// players
// numRows
// numCols
// numMines

// CELL PROPERTIES:
// isMine: boolean
// isOpen: boolean
// isFlagged: boolean
// nearbyMines: number

// Checked
const createRoom = async (room, numRows, numCols, numMines, name) => {
    const client = await redisClient;

    await client.hSet(`room:${room}`, {
        // Initialize empty board for player to visualize before first click
        board: JSON.stringify(Array(numRows)
            .fill(null)
            .map(() =>
                Array(numCols).fill({
                    isMine: false,
                    isOpen: false,
                    isFlagged: false,
                    nearbyMines: 0,
                })
            )),
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
        players: JSON.stringify([]),
        numRows: numRows.toString(),
        numCols: numCols.toString(),
        numMines: numMines.toString()
    })
    await client.expire(`room:${room}`, 86400); // Deletes room after 24 hours
}

const resetGame = async (room) => {
    const client = await redisClient;
    // Fetch room state once
    const roomState = await client.hGetAll(`room:${room}`);
    if (!roomState) return;

    const numRows = parseInt(roomState.numRows, 10);
    const numCols = parseInt(roomState.numCols, 10);

    // Create an empty board with a more memory-efficient method
    const newBoard = Array.from({ length: numRows }, () =>
        Array.from({ length: numCols }, () => ({
            isMine: false,
            isOpen: false,
            isFlagged: false,
            nearbyMines: 0,
        }))
    );

    // Emit events to reset the board and players
    io.to(room).emit('boardUpdate', newBoard);
    io.to(room).emit('resetEveryone');

    // Update room state and reset player scores in Redis
    await client.hSet(`room:${room}`, {
        board: JSON.stringify(newBoard),
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
    });

    // Reset player scores and update player names
    await Promise.all([
        resetPlayerScores(room),
        updatePlayerStatsInRoom(room),
    ]);
}
module.exports = { generateBoard, checkWin, createRoom, resetGame };