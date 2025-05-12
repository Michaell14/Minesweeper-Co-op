const { server, io } = require('./utils/initializeClient');
const { updatePlayerNamesInRoom, resetPlayerScores, removePlayer } = require('./utils/playerUtils');
const { createRoom, joinRoom } = require('./utils/gameUtils');
const { openCell, chordCell } = require('./utils/boardUtils');
const { redisClient } = require('./utils/initializeRedisClient');

// When a new socket connects
io.on('connection', async (socket) => {
    const client = await redisClient;
    socket.on('createRoom', async ({ room, numRows, numCols, numMines, name }) => {
        createRoom(room, numRows, numCols, numMines, name, socket);
    })

    // When a player joins a room
    socket.on('joinRoom', async ({ room, name }) => {
        joinRoom(room, name, socket, io);
    });

    // When a player opens a cell
    socket.on('openCell', async ({ room, row, col }) => {
        const roomExists = await client.exists(`room:${room}`);

        if (!roomExists) {
            return;
        }

        openCell(row, col, room, socket.id);
    });

    socket.on("chordCell", async ({ room, row, col }) => {
        chordCell(row, col, room, socket.id);
    });


    socket.on('toggleFlag', async ({ room, row, col }) => {
        toggleFlag(row, col, room);
    });

    socket.on("emitConfetti", async({room}) => {
        io.to(room).emit("receiveConfetti");
    })
    
    socket.on('resetGame', async ({ room }) => {
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