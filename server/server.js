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

const reveal = async (board, numRows, numCols, r, c, room, socketId) => {

    if (r < 0 || r >= numRows || c < 0 || c >= numCols || board[r][c].isOpen) return;

    board[r][c].isOpen = true;
    if (board[r][c].isMine) {
        const gameOverName = await redisClient.hGet(`player:${socketId}`, "name");
        io.to(room).emit('gameOver', gameOverName);
        await redisClient.hSet(`room:${room}`, { gameOver: 'true' });
        return;
    }

    if (board[r][c].nearbyMines === 0) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                reveal(board, numRows, numCols, r + dr, c + dc, room, socketId);
            }
        }
    }
};

const openCell = async (row, col, room, socketId) => {
    const roomState = await redisClient.hGetAll(`room:${room}`);
    let board = JSON.parse(roomState.board);

    if (roomState.gameOver === 'true' || roomState.gameWon === 'true'
        || board[row][col].isOpen || board[row][col].isFlagged) return;

    const numRows = parseInt(roomState.numRows);
    const numCols = parseInt(roomState.numCols);
    const numMines = parseInt(roomState.numMines);

    if (roomState.initialized === 'false') {
        board = generateBoard(numRows, numCols, numMines, row, col);
        await redisClient.hSet(`room:${room}`, { initialized: 'true' });
    } else if (!board[row][col].isMine) {
        const newScore = parseInt(await redisClient.hGet(`player:${socketId}`, "score")) + 1;
        await redisClient.hSet(`player:${socketId}`, { score: newScore.toString() })
        updatePlayerNamesInRoom(room);
    }

    reveal(board, numRows, numCols, row, col, room, socketId);
    checkWin(roomState, board, room);
    await redisClient.hSet(`room:${room}`, { board: JSON.stringify(board) });
    io.to(room).emit('boardUpdate', board, numRows, numCols, numMines);
    return;
}

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
    io.to(room).emit('boardUpdate', board, parseInt(roomState.numRows), parseInt(roomState.numCols), parseInt(roomState.numMines));

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

    // When a player toggles a flag
    socket.on('toggleFlag', async ({ room, row, col }) => {
        const roomExists = await redisClient.exists(`room:${room}`);
        const roomState = await redisClient.hGetAll(`room:${room}`);

        if (!roomExists || roomState.gameOver === 'true' || roomState.gameWon === 'true') return;

        const newBoard = JSON.parse(roomState.board);
        newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged;

        io.to(room).emit('boardUpdate', newBoard, parseInt(roomState.numRows), parseInt(roomState.numCols), parseInt(roomState.numMines));

        await redisClient.hSet(`room:${room}`, { board: JSON.stringify(newBoard) })
    });

    socket.on('resetGame', async ({ room }) => {
        const roomState = await redisClient.hGetAll(`room:${room}`);
        const numRows = parseInt(roomState.numRows);
        const numCols = parseInt(roomState.numCols);
        const numMines = parseInt(roomState.numMines);
        let newBoard = Array(numRows)
            .fill(null)
            .map(() =>
                Array(numCols).fill({
                    isMine: false,
                    isOpen: false,
                    isFlagged: false,
                    nearbyMines: 0,
                })
            )

        io.to(room).emit('boardUpdate', newBoard, numRows, numCols, numMines);
        io.to(room).emit("resetEveryone");
        await redisClient.hSet(`room:${room}`, {
            // Initialize empty board
            board: JSON.stringify(newBoard),
            gameOver: 'false',
            gameWon: 'false',
            initialized: 'false',
        })
        resetPlayerScores(room);
        updatePlayerNamesInRoom(room);
    })

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