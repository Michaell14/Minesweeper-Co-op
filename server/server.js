require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const redis = require('redis');

async function initializeRedisClient() {
    try {
        const client = redis.createClient({
            username: 'default',
            password: process.env.DB_PASS,
            socket: {
                host: process.env.HOST,
                port: process.env.REDIS_PORT
            },
        });

        await client.connect().then(() => {
            console.log('Connected to Redis');
        }).catch((err) => {
            console.error('Redis connection error:', err);
        });

        return client;
    } catch (error) {
        console.error('Failed to connect to Redis:', error);
        throw error;
    }
}

let redisClient;
(async () => {
    redisClient = await initializeRedisClient();
    await redisClient.flushDb();
})();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:3000", // Development
            "https://minesweeper-test.vercel.app", // Production
            "https://www.minesweepercoop.com"
        ]
    }
});

app.get('/cron', (req, res) => {
    res.send('Landing page is loaded.');
});

// Utility function to generate a board (reusing your board generation logic)
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
    while (placedMines < numMines) {
        const row = Math.floor(Math.random() * numRows);
        const col = Math.floor(Math.random() * numCols);

        if (
            !board[row][col].isMine &&
            !(row >= excludeRow - 1 && row <= excludeRow + 1 && col >= excludeCol - 1 && col <= excludeCol + 1)
        ) {
            board[row][col] = { ...board[row][col], isMine: true };
            placedMines++;
        }
    }

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
                board[r][c] = { ...board[r][c], nearbyMines: count };
            }
        }
    }

    return board;
};

const reveal = async (board, r, c, room, socketId, toUpdate) => {
    const stack = [[r, c]];

    while (stack.length > 0) {
        const [row, col] = stack.pop();

        if (row < 0 || row >= board.length || col < 0 || col >= board[0].length || board[row][col].isOpen) continue;

        board[row][col].isOpen = true;
        toUpdate.push({
            row: row,
            col: col,
            ...board[row][col],
        });

        if (board[row][col].isMine) {
            const gameOverName = await redisClient.hGet(`player:${socketId}`, "name");
            io.to(room).emit('gameOver', gameOverName);
            await redisClient.hSet(`room:${room}`, { gameOver: 'true' });
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
    // Fetch room state and board in parallel to save time
    const [roomState, playerScore] = await Promise.all([
        redisClient.hGetAll(`room:${room}`),
        redisClient.hGet(`player:${socketId}`, "score"),
    ]);

    // Parse board only if necessary
    let board = JSON.parse(roomState.board);

    // Check invalid scenarios early to return immediately
    if (
        roomState.gameOver === 'true' ||
        roomState.gameWon === 'true' ||
        !board ||
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
        await redisClient.hSet(`room:${room}`, { 
            initialized: 'true', 
            board: JSON.stringify(board) 
        });
        justInitialized = true;
    } else if (!board[row][col].isMine) {
        // Update player score in a single database operation
        const newScore = parseInt(playerScore || '0') + 1;
        await redisClient.hSet(`player:${socketId}`, { score: newScore.toString() });
        updatePlayerNamesInRoom(room); // Consider making this function asynchronous
    }

    // Reveal cells and update board state
    const toUpdate = [];
    reveal(board, row, col, room, socketId, toUpdate);

    // Check for game win condition
    checkWin(roomState, board, room);

    // Batch board and updateCells operations together
    await redisClient.hSet(`room:${room}`, { board: JSON.stringify(board) });

    if (justInitialized) {
        io.to(room).emit("boardUpdate", board);
    } else {
        io.to(room).emit('updateCells', toUpdate);
    }
    
};

const checkWin = async (roomState, board, room) => {
    if (roomState.gameOver === 'true') {
        return;
    }

    const allNonMinesOpened = board.every((row) =>
        row.every((cell) => (cell.isMine && !cell.isOpen) || (!cell.isMine && cell.isOpen))
    );

    if (allNonMinesOpened) {
        await redisClient.hSet(`room:${room}`, { gameWon: 'true' });
        io.to(room).emit('gameWon');
    }
}

const updatePlayerNamesInRoom = async (room) => {
    if (!room) return;
    const playersInRoom = JSON.parse(await redisClient.hGet(`room:${room}`, "players"));

    if (!playersInRoom) return;

    const roomNames = [];
    for (let i = 0; i < playersInRoom.length; i++) {
        const playerState = await redisClient.hGetAll(`player:${playersInRoom[i]}`);
        roomNames.push({
            name: playerState.name,
            score: parseInt(playerState.score)
        });
    }

    io.to(room).emit("playerNamesUpdate", roomNames);
}

const resetPlayerScores = async (room) => {
    if (!room) return;
    const playersInRoom = JSON.parse(await redisClient.hGet(`room:${room}`, "players"));

    if (!playersInRoom) return;

    for (let i = 0; i < playersInRoom.length; i++) {
        await redisClient.hSet(`player:${playersInRoom[i]}`, { "score": "0" })
    }
}

const addPlayerToRoom = async (room, socketId, name) => {
    const playerExists = await redisClient.exists(`player:${socketId}`);
    if (!playerExists) {
        await redisClient.hSet(`player:${socketId}`, {
            room: "",
            name: name,
            score: "0"
        })
        await redisClient.expire(`player:${socketId}`, 86400); // Deletes a user after a day
    }

    await redisClient.hSet(`player:${socketId}`, { "room": room });

    const roomState = await redisClient.hGetAll(`room:${room}`);
    const roomPlayers = JSON.parse(roomState.players);
    roomPlayers.push(socketId);
    // Save the updated players array back to Redis
    await redisClient.hSet(`room:${room}`, { players: JSON.stringify(roomPlayers) });

    // Send the current board to the player who joined
    const board = JSON.parse(roomState.board);
    io.to(room).emit('boardUpdate', board);

    updatePlayerNamesInRoom(room);
}

const removePlayer = async (socket, socketId) => {
    const playerExists = await redisClient.exists(`player:${socketId}`);
    if (!playerExists) return;

    const room = await redisClient.hGet(`player:${socketId}`, 'room');

    const playersInRoom = JSON.parse(await redisClient.hGet(`room:${room}`, "players"));

    if (playersInRoom && playersInRoom.includes(socketId)) {
        const index = playersInRoom.indexOf(socketId); // Find the index of the element
        if (index > -1) {
            playersInRoom.splice(index, 1);
        }

        await redisClient.hSet(`room:${room}`, { "players": JSON.stringify(playersInRoom) });
        // If the room is empty, clean up
        if (playersInRoom.length === 0) {
            await redisClient.del(`room:${room}`);
        }
    }
    updatePlayerNamesInRoom(room);
    socket.leave(room);
    await redisClient.del(`player:${socketId}`);
}

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

// When a new socket connects
io.on('connection', (socket) => {
    // console.log(`Player connected: ${socket.id}`);
    socket.on('wakeUp', () => {
        return;
    });

    socket.on('createRoom', async ({ room, numRows, numCols, numMines, name }) => {
        const roomExists = await redisClient.exists(`room:${room}`);
        socket.join(`${socket.id}:${room}`);
        // Eventually emit an error
        if (roomExists) {
            io.to(`${socket.id}:${room}`).emit("createRoomError");
            socket.leave(room);
            return;
        }
        socket.leave(`${socket.id}:${room}`);
        socket.join(room);

        await redisClient.hSet(`room:${room}`, {
            // Initialize empty board
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

        addPlayerToRoom(room, socket.id, name);
        io.to(room).emit("joinRoomSuccess", room);

    })

    // When a player joins a room
    socket.on('joinRoom', async ({ room, name }) => {
        const roomExists = await redisClient.exists(`room:${room}`);
        socket.join(room);
        // If the room doesn't have a board yet, create one
        if (!roomExists) {
            io.to(room).emit("joinRoomError");
            socket.leave(room);
            return;
        }

        addPlayerToRoom(room, socket.id, name);
        io.to(room).emit("joinRoomSuccess", room);
    });

    // When a player opens a cell
    socket.on('openCell', async ({ room, row, col }) => {
        const roomExists = await redisClient.exists(`room:${room}`);

        if (!roomExists) {
            return;
        }

        openCell(row, col, room, socket.id);
    });

    socket.on("chordCell", async ({ room, row, col }) => {
        const roomState = await redisClient.hGetAll(`room:${room}`);
        if (!roomState || roomState.gameOver === 'true' || roomState.gameWon === 'true') {
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
                    reveal(board, adj.row, adj.col, room, socket.id, toUpdate);
                    if (!adj.isMine) {
                        scoreIncrease += 1;
                    }
                }
            });
        }

        // Updating player score
        const newScore = parseInt(await redisClient.hGet(`player:${socket.id}`, "score")) + scoreIncrease;
        await redisClient.hSet(`player:${socket.id}`, { score: newScore.toString() })
        updatePlayerNamesInRoom(room);

        checkWin(roomState, board, room);
        io.to(room).emit("updateCells", toUpdate);
        await redisClient.hSet(`room:${room}`, { board: JSON.stringify(board) });
    });


    socket.on('toggleFlag', async ({ room, row, col }) => {
        // Check if room exists and fetch its state in a single call
        const roomState = await redisClient.hGetAll(`room:${room}`);
        if (!roomState || roomState.gameOver === 'true' || roomState.gameWon === 'true') return;
        
        if (!roomState || !roomState.board) return;
        const board = JSON.parse(roomState.board);
        
        // Exit early if the cell is already open
        if (!board || !board[row][col] || board[row][col].isOpen) return;
    
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
        await redisClient.hSet(`room:${room}`, { board: JSON.stringify(board) });
    });

    socket.on("emitConfetti", async({room}) => {
        io.to(room).emit("receiveConfetti");
    })
    

    socket.on('resetGame', async ({ room }) => {
        // Fetch room state once
        const roomState = await redisClient.hGetAll(`room:${room}`);
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
        await redisClient.hSet(`room:${room}`, {
            board: JSON.stringify(newBoard),
            gameOver: 'false',
            gameWon: 'false',
            initialized: 'false',
        });
    
        // Reset player scores and update player names
        await Promise.all([
            resetPlayerScores(room),
            updatePlayerNamesInRoom(room),
        ]);
    });
    

    socket.on("playerLeave", async () => {
        removePlayer(socket, socket.id);
    });

    socket.on('disconnect', async () => {
        // console.log(`Player disconnected: ${socket.id}`);
        removePlayer(socket, socket.id);
    });
});

PORT = 3001
// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});