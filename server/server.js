const { server, io } = require('./utils/initializeClient');
const { removePlayer, addPlayerToRoom } = require('./utils/playerUtils');
const { createRoom, resetGame } = require('./utils/gameUtils');
const { openCell, chordCell, toggleFlag } = require('./utils/boardUtils');
const { redisClient } = require('./utils/initializeRedisClient');

// When a new socket connects
io.on('connection', async (socket) => {
    const client = await redisClient;
    
    socket.on('createRoom', async ({ room, numRows, numCols, numMines, name }) => {
        const roomExists = await client.exists(`room:${room}`);

        // If the room exists, emit an error
        if (roomExists) {
            socket.join(`${socket.id}:${room}`);
            io.to(`${socket.id}:${room}`).emit("createRoomError");
            socket.leave(`${socket.id}:${room}`);
            return;
        }
        socket.join(room);

        await createRoom(room, numRows, numCols, numMines, name); // Creates the room once we verified that it doesn't exist
        await addPlayerToRoom(room, socket.id, name); // Adds player's socket_id to current room
        io.to(room).emit("joinRoomSuccess", room); // Returns success
    })

    // When a player joins a room
    socket.on('joinRoom', async ({ room, name }) => {
        const roomExists = await client.exists(`room:${room}`);

        socket.join(room);

        // If room does not exist, emit error + leave room
        if (!roomExists) {
            io.to(room).emit("joinRoomError");
            socket.leave(room);
            return;
        }

        addPlayerToRoom(room, socket.id, name); // Adds player's socket_id to current room
        io.to(room).emit("joinRoomSuccess", room); // Returns success
    });

    // When a player opens a cell
    socket.on('openCell', async ({ room, row, col }) => {

        // If player is somehow clicking on a cell, but they haven't managed to enter a room, then return
        // Scenario: Room times out and gets deleted
        const roomExists = await client.exists(`room:${room}`);
        if (!roomExists) {
            return;
        }

        openCell(row, col, room, socket.id);
    });

    socket.on("chordCell", async ({ room, row, col }) => {
        const roomExists = await client.exists(`room:${room}`);
        if (!roomExists) {
            return;
        }
        chordCell(row, col, room, socket.id);
    });

    socket.on('toggleFlag', async ({ room, row, col }) => {
        toggleFlag(row, col, room, socket.id);
    });

    socket.on("emitConfetti", async ({ room }) => {
        io.to(room).emit("receiveConfetti");
    })

    socket.on('resetGame', async ({ room }) => {
        resetGame(room);
    });

    socket.on("playerLeave", async () => {
        removePlayer(socket, socket.id);
    });

    socket.on('disconnect', async () => {
        removePlayer(socket, socket.id);
    });
});

PORT = 3001
// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});