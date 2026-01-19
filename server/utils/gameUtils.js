const { addPlayerToRoom, resetPlayerScores, updatePlayerStatsInRoom } = require('./playerUtils');
const { io } = require('./initializeClient');
const { redisClient } = require('./initializeRedisClient');

// Utility function to generate a board
// Checked
const generateBoard = (numRows, numCols, numMines, excludeRow, excludeCol) => {
    const board = Array.from({ length: numRows }, () =>
        Array.from({ length: numCols }, () => ({
            isMine: false,
            isOpen: false,
            isFlagged: false,
            nearbyMines: 0,
        }))
    );

    // Calculate available cells (excluding the 3x3 area around first click)
    const totalCells = numRows * numCols;
    const excludedCells = 9; // 3x3 grid around first click
    const maxMines = totalCells - excludedCells;

    // Prevent infinite loop by capping mines at available space
    const actualMines = Math.min(numMines, maxMines);

    // Create array of all valid positions
    const validPositions = [];
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            // Exclude 3x3 area around first click
            if (!(r >= excludeRow - 1 && r <= excludeRow + 1 && c >= excludeCol - 1 && c <= excludeCol + 1)) {
                validPositions.push({ row: r, col: c });
            }
        }
    }

    // Shuffle array using Fisher-Yates algorithm and place mines
    for (let i = validPositions.length - 1; i >= validPositions.length - actualMines; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validPositions[i], validPositions[j]] = [validPositions[j], validPositions[i]];

        const { row, col } = validPositions[i];
        board[row][col] = {
            ...board[row][col],
            isMine: true
        };
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
    // Don't check win if game is already over or won
    if (roomState.gameOver === 'true' || roomState.gameWon === 'true') {
        return;
    }

    const allNonMinesOpened = board.every((row) =>
        row.every((cell) => (cell.isMine && !cell.isOpen) || (!cell.isMine && cell.isOpen))
    );

    if (allNonMinesOpened) {
        const client = await redisClient;
        // Double-check in Redis to prevent race condition
        const currentState = await client.hGet(`room:${room}`, 'gameWon');
        if (currentState === 'true') {
            return; // Already won, don't emit again
        }
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
const createRoom = async (room, numRows, numCols, numMines, mode = 'co-op') => {
    const client = await redisClient;

    const roomData = {
        mode: mode,
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
        players: JSON.stringify([]),
        numRows: numRows.toString(),
        numCols: numCols.toString(),
        numMines: numMines.toString()
    };

    if (mode === 'co-op') {
        // Initialize empty board for co-op mode
        roomData.board = JSON.stringify(Array.from({ length: numRows }, () =>
            Array.from({ length: numCols }, () => ({
                isMine: false,
                isOpen: false,
                isFlagged: false,
                nearbyMines: 0,
            }))
        ));
    } else if (mode === 'pvp') {
        // Initialize PVP-specific fields
        roomData.pvpStarted = 'false';
        roomData.hostSocket = ''; // Track who the host is (first player to join)
        roomData.player1Socket = '';
        roomData.player2Socket = '';
        roomData.player1Board = '';
        roomData.player2Board = '';
        roomData.player1Initialized = 'false';
        roomData.player2Initialized = 'false';
        roomData.player1GameOver = 'false';
        roomData.player2GameOver = 'false';
        roomData.player1GameWon = 'false';
        roomData.player2GameWon = 'false';
        roomData.player1Progress = '0'; // Progress tracking (cells revealed)
        roomData.player2Progress = '0';
        roomData.totalSafeCells = '0'; // Set when game starts
        roomData.winnerSocket = '';
        roomData.sharedBoardSeed = ''; // For generating identical boards
    }

    await client.hSet(`room:${room}`, roomData);
    await client.expire(`room:${room}`, 86400); // Deletes room after 24 hours
}

// Generate a seeded board (for PVP - both players get identical mines)
const generateSeededBoard = (numRows, numCols, numMines, seed) => {
    // Seeded random number generator
    const seededRandom = (seed) => {
        let s = seed;
        return () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    };

    const random = seededRandom(seed);

    const board = Array.from({ length: numRows }, () =>
        Array.from({ length: numCols }, () => ({
            isMine: false,
            isOpen: false,
            isFlagged: false,
            nearbyMines: 0,
        }))
    );

    // Place mines randomly using seeded random
    const totalCells = numRows * numCols;
    const actualMines = Math.min(numMines, totalCells - 9); // Leave room for first click safe zone

    // Create array of all positions
    const allPositions = [];
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            allPositions.push({ row: r, col: c });
        }
    }

    // Shuffle using seeded random (Fisher-Yates)
    for (let i = allPositions.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [allPositions[i], allPositions[j]] = [allPositions[j], allPositions[i]];
    }

    // Place mines at first N positions
    for (let i = 0; i < actualMines; i++) {
        const { row, col } = allPositions[i];
        board[row][col].isMine = true;
    }

    // Calculate nearbyMines for each cell
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
                board[r][c].nearbyMines = count;
            }
        }
    }

    return board;
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
        gameOverName: '',
    });

    // Reset player scores and update player names
    await Promise.all([
        resetPlayerScores(room),
        updatePlayerStatsInRoom(room),
    ]);
}
module.exports = { generateBoard, generateSeededBoard, checkWin, createRoom, resetGame };