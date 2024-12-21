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
                port: process.env.PORT
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
        origin: "https://minesweeper-test.vercel.app/" 
    }
});


const BOARD_SIZE = 8;
const NUM_MINES = 10;
const PORT = 3001;

const rooms = {}; // Store rooms and their boards
//const playersInRoom = {};

// Utility function to generate a board (reusing your board generation logic)
const generateBoard = (size, mines, excludeRow, excludeCol) => {
    const board = Array(size)
        .fill(null)
        .map(() =>
            Array(size).fill({
                isMine: false,
                isOpen: false,
                isFlagged: false,
                nearbyMines: 0,
            })
        );

    let placedMines = 0;
    while (placedMines < mines) {
        const row = Math.floor(Math.random() * size);
        const col = Math.floor(Math.random() * size);

        if (
            !board[row][col].isMine &&
            !(row >= excludeRow - 1 && row <= excludeRow + 1 && col >= excludeCol - 1 && col <= excludeCol + 1)
        ) {
            board[row][col] = { ...board[row][col], isMine: true };
            placedMines++;
        }
    }

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (!board[r][c].isMine) {
                let count = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc].isMine) {
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

const reveal = async (board, r, c, room) => {
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c].isOpen) return;

    board[r][c].isOpen = true;
    if (board[r][c].isMine) {
        io.to(room).emit('gameOver');
        await redisClient.hSet(`room:${room}`, { gameOver: 'true' });
        //roomState.gameOver = true;
        return;
    }

    if (board[r][c].nearbyMines === 0) {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                reveal(board, r + dr, c + dc, room);
            }
        }
    }
};

const openCell = async (row, col, room) => {
    const roomState = await redisClient.hGetAll(`room:${room}`);
    let board = JSON.parse(roomState.board);

    if (roomState.gameOver === 'true' || board[row][col].isOpen || board[row][col].isFlagged) return;

    if (roomState.initialized === 'false') {
        board = generateBoard(BOARD_SIZE, NUM_MINES, row, col);
        await redisClient.hSet(`room:${room}`, { initialized: 'true' });
        //roomState.initialized = true;
        //roomState.board = generateBoard(BOARD_SIZE, NUM_MINES, row, col);
        //io.to(room).emit('initialized', true);
        //openCell(row, col, room); // Re-run the logic to open the clicked cell
    }

    // const newBoard = board.map((row) => row.map((cell) => ({ ...cell })));

    reveal(board, row, col, room);
    checkWin(roomState, board, room);
    await redisClient.hSet(`room:${room}`, { board: JSON.stringify(board) });
    io.to(room).emit('boardUpdate', board);
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

// When a new socket connects
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    console.log(rooms);

    // When a player joins a room
    socket.on('joinRoom', async ({ room }) => {
        socket.join(room);
        const roomExists = await redisClient.exists(`room:${room}`);
        const playerExists = await redisClient.exists(`player:${socket.id}`);

        // If the room doesn't have a board yet, create one
        if (!roomExists) {
            await redisClient.hSet(`room:${room}`, {
                // Initialize empty board
                board: JSON.stringify(Array(BOARD_SIZE)
                    .fill(null)
                    .map(() =>
                        Array(BOARD_SIZE).fill({
                            isMine: false,
                            isOpen: false,
                            isFlagged: false,
                            nearbyMines: 0,
                        })
                    )),
                gameOver: 'false',
                gameWon: 'false',
                initialized: 'false',
                players: JSON.stringify([])
            })
            await redisClient.expire(`room:${room}`, 86400); // Deletes a room after a day
        }

        if (!playerExists) {
            await redisClient.hSet(`player:${socket.id}`, {
                rooms: JSON.stringify([])
            })
            await redisClient.expire(`player:${socket.id}`, 86400); // Deletes a user after a day
        }

        const playerRooms = JSON.parse(await redisClient.hGet(`player:${socket.id}`, "rooms"));
        playerRooms.push(room);
        await redisClient.hSet(`player:${socket.id}`, { "rooms": JSON.stringify(playerRooms) });

        const roomPlayers = JSON.parse(await redisClient.hGet(`room:${room}`, "players"));
        roomPlayers.push(socket.id);
        console.log(roomPlayers);
        // Save the updated players array back to Redis
        await redisClient.hSet(`room:${room}`, { players: JSON.stringify(roomPlayers) });
        //playersInRoom[room].add(socket.id);
        // Send the current board to the player who joined
        const board = JSON.parse(await redisClient.hGet(`room:${room}`, "board"));
        socket.emit('boardUpdate', board);
        console.log(`Player ${socket.id} joined room ${room}`);
    });

    // When a player opens a cell
    socket.on('openCell', async ({ room, row, col }) => {
        const roomExists = await redisClient.exists(`room:${room}`);
        if (!roomExists) return;

        openCell(row, col, room);
    });

    // When a player toggles a flag
    socket.on('toggleFlag', async ({ room, row, col }) => {
        const roomExists = await redisClient.exists(`room:${room}`);
        const roomState = await redisClient.hGetAll(`room:${room}`);

        if (!roomExists || roomState.gameOver === 'true') return;

        const newBoard = JSON.parse(roomState.board);
        newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged;
        
        io.to(room).emit('boardUpdate', newBoard);

        await redisClient.hSet(`room:${room}`, { board: JSON.stringify(newBoard) })
    });

    socket.on('disconnect', async () => {
        console.log(`Player disconnected: ${socket.id}`);
        const playerExists = await redisClient.exists(`player:${socket.id}`);
        if (!playerExists) return;

        const playerRooms = JSON.parse(await redisClient.hGet(`player:${socket.id}`, 'rooms'));
        console.log(playerRooms);
    
        playerRooms.forEach(async (room) => {
            const playersInRoom = JSON.parse(await redisClient.hGet(`room:${room}`, "players"));
            console.log(playersInRoom);
            if (playersInRoom.includes(socket.id)) {
                const index = playersInRoom.indexOf(socket.id); // Find the index of the element
                if (index > -1) {
                    playersInRoom.splice(index, 1);
                }

                await redisClient.hSet(`room:${room}`, { "players": JSON.stringify(playersInRoom) });
                // If the room is empty, clean up
                if (playersInRoom.length === 0) {
                    await redisClient.del(`room:${room}`);
                    console.log(`Room ${room} has been removed (no players left).`);
                }
            }
        });

        await redisClient.del(`player:${socket.id}`);

    });

});

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
