const { server, io } = require('./utils/initializeClient');
const { removePlayer, addPlayerToRoom } = require('./utils/playerUtils');
const { createRoom, resetGame } = require('./utils/gameUtils');
const { openCell, chordCell, toggleFlag } = require('./utils/boardUtils');
const { redisClient } = require('./utils/initializeRedisClient');

// When a new socket connects
io.on('connection', async (socket) => {
    const client = await redisClient;
    
    socket.on('createRoom', async ({ room, numRows, numCols, numMines, name }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string' || room.length === 0 || room.length > 100) {
                socket.emit("createRoomError");
                return;
            }
            if (!name || typeof name !== 'string' || name.length === 0 || name.length > 50) {
                socket.emit("createRoomError");
                return;
            }
            if (typeof numRows !== 'number' || numRows < 8 || numRows > 32) {
                socket.emit("createRoomError");
                return;
            }
            if (typeof numCols !== 'number' || numCols < 8 || numCols > 16) {
                socket.emit("createRoomError");
                return;
            }
            if (typeof numMines !== 'number' || numMines < 1 || numMines >= (numRows * numCols) / 2) {
                socket.emit("createRoomError");
                return;
            }

            const roomExists = await client.exists(`room:${room}`);

            // If the room exists, emit an error
            if (roomExists) {
                socket.join(`${socket.id}:${room}`);
                io.to(`${socket.id}:${room}`).emit("createRoomError");
                socket.leave(`${socket.id}:${room}`);
                return;
            }
            socket.join(room);

            await createRoom(room, numRows, numCols, numMines); // Creates the room once we verified that it doesn't exist
            await addPlayerToRoom(room, socket.id, name); // Adds player's socket_id to current room
            io.to(room).emit("joinRoomSuccess", room); // Returns success
        } catch (error) {
            console.error('Error in createRoom:', error);
            io.to(`${socket.id}:${room}`).emit("createRoomError");
        }
    })

    // When a player joins a room
    socket.on('joinRoom', async ({ room, name }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string' || room.length === 0 || room.length > 100) {
                socket.emit("joinRoomError");
                return;
            }
            if (!name || typeof name !== 'string' || name.length === 0 || name.length > 50) {
                socket.emit("joinRoomError");
                return;
            }

            const roomExists = await client.exists(`room:${room}`);

            socket.join(room);

            // If room does not exist, emit error + leave room
            if (!roomExists) {
                io.to(room).emit("joinRoomError");
                socket.leave(room);
                return;
            }

            await addPlayerToRoom(room, socket.id, name); // Adds player's socket_id to current room
            io.to(room).emit("joinRoomSuccess", room); // Returns success
        } catch (error) {
            console.error('Error in joinRoom:', error);
            io.to(room).emit("joinRoomError");
            socket.leave(room);
        }
    });

    const isValid = async (room) => {
        const roomExists = await client.exists(`room:${room}`);
        const playerExists = await client.exists(`player:${socket.id}`);
        if (!roomExists || !playerExists) {
            io.to(room).emit("roomDoesNotExistError");
            socket.leave(room);
            return false;
        }

        // Verify player is actually in the room's player list
        const roomState = await client.hGetAll(`room:${room}`);
        const playersInRoom = JSON.parse(roomState.players || '[]');
        if (!playersInRoom.includes(socket.id)) {
            io.to(room).emit("roomDoesNotExistError");
            socket.leave(room);
            return false;
        }

        return true;
    }

    // When a player opens a cell
    socket.on('openCell', async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;
            if (typeof row !== 'number' || typeof col !== 'number') return;
            if (!Number.isInteger(row) || !Number.isInteger(col)) return;
            if (row < 0 || row > 100 || col < 0 || col > 100) return;

            // If player is somehow clicking on a cell, but they haven't managed to enter a room, then return
            // Scenario: Room times out and gets deleted
            if (!(await isValid(room))) return;
            await openCell(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in openCell:', error);
        }
    });

    socket.on("chordCell", async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;
            if (typeof row !== 'number' || typeof col !== 'number') return;
            if (!Number.isInteger(row) || !Number.isInteger(col)) return;
            if (row < 0 || row > 100 || col < 0 || col > 100) return;

            if (!(await isValid(room))) return;
            await chordCell(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in chordCell:', error);
        }
    });

    socket.on('toggleFlag', async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;
            if (typeof row !== 'number' || typeof col !== 'number') return;
            if (!Number.isInteger(row) || !Number.isInteger(col)) return;
            if (row < 0 || row > 100 || col < 0 || col > 100) return;

            if (!(await isValid(room))) return;
            await toggleFlag(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in toggleFlag:', error);
        }
    });

    socket.on("emitConfetti", async ({ room }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;

            if (!(await isValid(room))) return;
            io.to(room).emit("receiveConfetti");
        } catch (error) {
            console.error('Error in emitConfetti:', error);
        }
    })

    socket.on('cellHover', async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;
            if (typeof row !== 'number' || typeof col !== 'number') return;
            if (!Number.isInteger(row) || !Number.isInteger(col)) return;
            
            // Validate bounds (allow -1 for "no hover")
            if ((row !== -1 && col !== -1) && (row < 0 || row > 100 || col < 0 || col > 100)) return;

            // CRITICAL: Validate that the player is actually in the room
            // This prevents unauthorized hover spam
            const roomExists = await client.exists(`room:${room}`);
            const playerExists = await client.exists(`player:${socket.id}`);
            if (!roomExists || !playerExists) return;

            // Verify player is actually in the room's player list
            const roomState = await client.hGetAll(`room:${room}`);
            const playersInRoom = JSON.parse(roomState.players || '[]');
            if (!playersInRoom.includes(socket.id)) return;

            // Get player name for the hover event
            const playerName = await client.hGet(`player:${socket.id}`, 'name');
            if (!playerName) return;

            // Broadcast to everyone else in the room
            socket.to(room).emit('playerHoverUpdate', { 
                id: socket.id, 
                row, 
                col, 
                name: playerName 
            });
        } catch (error) {
            console.error('Error in cellHover:', error);
        }
    });

    socket.on('resetGame', async ({ room }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;

            if (!(await isValid(room))) return;
            await resetGame(room);
        } catch (error) {
            console.error('Error in resetGame:', error);
        }
    });

    socket.on("playerLeave", async () => {
        try {
            await removePlayer(socket, socket.id);
        } catch (error) {
            console.error('Error in playerLeave:', error);
        }
    });

    socket.on('disconnect', async () => {
        try {
            await removePlayer(socket, socket.id);
        } catch (error) {
            console.error('Error in disconnect:', error);
        }
    });
});

const PORT = process.env.PORT || 3001;
// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});