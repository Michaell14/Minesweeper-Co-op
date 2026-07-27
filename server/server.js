const { server, io } = require('./utils/initializeClient');
const { removePlayer, addPlayerToRoom } = require('./utils/playerUtils');
const { createRoom, resetGame } = require('./utils/gameUtils');
const { openCell, chordCell, toggleFlag } = require('./game');
const { startPvpGame, resetMyBoard, pvpRematch } = require('./controllers/pvpController');
const { PORT } = require('./config');
const roomRepo = require('./data/roomRepo');
const playerRepo = require('./data/playerRepo');
const {
    isValidRoomCode,
    isValidPlayerName,
    isValidMode,
    isValidBoardConfig,
    isValidCoordinate,
    isValidHoverCoordinate,
    isPlayerInRoom,
} = require('./validation');

// When a new socket connects
io.on('connection', async (socket) => {
    
    socket.on('createRoom', async ({ room, numRows, numCols, numMines, name, mode }) => {
        try {
            // Validate input parameters
            if (
                !isValidRoomCode(room) ||
                !isValidPlayerName(name) ||
                !isValidBoardConfig(numRows, numCols, numMines) ||
                !isValidMode(mode)
            ) {
                socket.emit("createRoomError");
                return;
            }

            const roomExists = await roomRepo.exists(room);

            // If the room exists, emit an error
            if (roomExists) {
                socket.join(`${socket.id}:${room}`);
                io.to(`${socket.id}:${room}`).emit("createRoomError");
                socket.leave(`${socket.id}:${room}`);
                return;
            }
            socket.join(room);

            await createRoom(room, numRows, numCols, numMines, mode); // Creates the room once we verified that it doesn't exist

            // For PVP mode, the creator is the host
            if (mode === 'pvp') {
                await roomRepo.setFields(room, { hostSocket: socket.id });
            }

            await addPlayerToRoom(room, socket.id, name); // Adds player's socket_id to current room
            io.to(room).emit("joinRoomSuccess", { room, mode, isHost: mode === 'pvp' }); // Returns success with mode and host status
        } catch (error) {
            console.error('Error in createRoom:', error);
            io.to(`${socket.id}:${room}`).emit("createRoomError");
        }
    })

    // When a player joins a room
    socket.on('joinRoom', async ({ room, name }) => {
        try {
            // Validate input parameters
            if (!isValidRoomCode(room) || !isValidPlayerName(name)) {
                socket.emit("joinRoomError");
                return;
            }

            const roomExists = await roomRepo.exists(room);

            socket.join(room);

            // If room does not exist, emit error + leave room
            if (!roomExists) {
                io.to(room).emit("joinRoomError");
                socket.leave(room);
                return;
            }

            // Check if it's a PVP room and if it's full
            const roomState = await roomRepo.getState(room);
            const mode = roomState.mode || 'co-op';

            if (mode === 'pvp') {
                const players = roomRepo.playersFrom(roomState);
                // Check if player is already in the room (reconnecting)
                const isReconnecting = players.includes(socket.id);

                if (!isReconnecting && players.length >= 2) {
                    socket.emit("pvpRoomFull");
                    socket.leave(room);
                    return;
                }
            }

            await addPlayerToRoom(room, socket.id, name); // Adds player's socket_id to current room

            // For PVP mode, check if this player is the host
            const isHost = mode === 'pvp' && roomState.hostSocket === socket.id;
            // Include difficulty config so joining players can set their flag counter correctly
            socket.emit("joinRoomSuccess", {
                room,
                mode,
                isHost,
                numRows: parseInt(roomState.numRows),
                numCols: parseInt(roomState.numCols),
                numMines: parseInt(roomState.numMines)
            }); // Send to joining player

            // If PVP mode and now 2 players, notify that room is ready
            if (mode === 'pvp') {
                const updatedPlayers = await roomRepo.getPlayers(room);
                if (updatedPlayers.length === 2) {
                    // Get host and player names
                    const hostSocket = roomState.hostSocket;
                    const guestSocket = updatedPlayers.find(p => p !== hostSocket);
                    const hostName = await playerRepo.getName(hostSocket);
                    const guestName = await playerRepo.getName(guestSocket);

                    // Notify both players that room is ready with player info
                    io.to(hostSocket).emit("pvpRoomReady", {
                        opponentName: guestName,
                        isHost: true
                    });
                    io.to(guestSocket).emit("pvpRoomReady", {
                        opponentName: hostName,
                        isHost: false
                    });
                }
            }
        } catch (error) {
            console.error('Error in joinRoom:', error);
            io.to(room).emit("joinRoomError");
            socket.leave(room);
        }
    });

    const isValid = async (room) => {
        const roomExists = await roomRepo.exists(room);
        const playerExists = await playerRepo.exists(socket.id);
        if (!roomExists || !playerExists) {
            io.to(room).emit("roomDoesNotExistError");
            socket.leave(room);
            return false;
        }

        // Verify player is actually in the room's player list
        const roomState = await roomRepo.getState(room);
        if (!isPlayerInRoom(roomState, socket.id)) {
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
            if (!isValidRoomCode(room) || !isValidCoordinate(row, col)) return;

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
            if (!isValidRoomCode(room) || !isValidCoordinate(row, col)) return;

            if (!(await isValid(room))) return;
            await chordCell(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in chordCell:', error);
        }
    });

    socket.on('toggleFlag', async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!isValidRoomCode(room) || !isValidCoordinate(row, col)) return;

            if (!(await isValid(room))) return;
            await toggleFlag(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in toggleFlag:', error);
        }
    });

    socket.on("emitConfetti", async ({ room }) => {
        try {
            // Validate input parameters
            if (!isValidRoomCode(room)) return;

            if (!(await isValid(room))) return;
            io.to(room).emit("receiveConfetti");
        } catch (error) {
            console.error('Error in emitConfetti:', error);
        }
    })

    socket.on('cellHover', async ({ room, row, col }) => {
        try {
            // Validate input parameters (row/col of -1 means "no hover")
            if (!isValidRoomCode(room) || !isValidHoverCoordinate(row, col)) return;

            // CRITICAL: Validate that the player is actually in the room
            // This prevents unauthorized hover spam
            const roomExists = await roomRepo.exists(room);
            const playerExists = await playerRepo.exists(socket.id);
            if (!roomExists || !playerExists) return;

            // Verify player is actually in the room's player list
            const roomState = await roomRepo.getState(room);
            if (!isPlayerInRoom(roomState, socket.id)) return;

            // Skip hover broadcasting in PVP mode - players shouldn't see opponent's cursor
            if (roomState.mode === 'pvp') return;

            // Get player name for the hover event
            const playerName = await playerRepo.getName(socket.id);
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
            if (!isValidRoomCode(room)) return;

            if (!(await isValid(room))) return;
            await resetGame(room);
        } catch (error) {
            console.error('Error in resetGame:', error);
        }
    });

    socket.on('startPvpGame', async ({ room }) => {
        await startPvpGame({ socket, room, isValid, io });
    });

    socket.on('resetMyBoard', async ({ room }) => {
        await resetMyBoard({ socket, room, isValid, io });
    });

    socket.on('pvpRematch', async ({ room }) => {
        await pvpRematch({ socket, room, isValid, io });
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

// Start the server, enter
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
