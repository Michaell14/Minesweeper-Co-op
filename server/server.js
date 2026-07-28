const { server, io } = require('./utils/initializeClient');
const { removePlayer, addPlayerToRoom } = require('./utils/playerUtils');
const { createRoom, resetGame } = require('./utils/gameUtils');
const { openCell, chordCell, toggleFlag } = require('./game');
const { startPvpGame, resetMyBoard, pvpRematch } = require('./controllers/pvpController');
const { PORT } = require('./config');
const roomRepo = require('./data/roomRepo');
const playerRepo = require('./data/playerRepo');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('../shared/events');
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
    
    socket.on(CLIENT_EVENTS.CREATE_ROOM, async ({ room, numRows, numCols, numMines, name, mode }) => {
        try {
            // Validate input parameters
            if (
                !isValidRoomCode(room) ||
                !isValidPlayerName(name) ||
                !isValidBoardConfig(numRows, numCols, numMines) ||
                !isValidMode(mode)
            ) {
                socket.emit(SERVER_EVENTS.CREATE_ROOM_ERROR);
                return;
            }

            const roomExists = await roomRepo.exists(room);

            // If the room exists, emit an error to this socket only
            if (roomExists) {
                socket.emit(SERVER_EVENTS.CREATE_ROOM_ERROR);
                return;
            }
            socket.join(room);

            await createRoom(room, numRows, numCols, numMines, mode); // Creates the room once we verified that it doesn't exist

            // For PVP mode, the creator is the host
            if (mode === 'pvp') {
                await roomRepo.setFields(room, { hostSocket: socket.id });
            }

            await addPlayerToRoom(room, socket.id, name, socket.handshake.auth?.sessionId);
            io.to(room).emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, { room, mode, isHost: mode === 'pvp' }); // Returns success with mode and host status
        } catch (error) {
            console.error('Error in createRoom:', error);
            socket.emit(SERVER_EVENTS.CREATE_ROOM_ERROR);
        }
    })

    // When a player joins a room
    socket.on(CLIENT_EVENTS.JOIN_ROOM, async ({ room, name }) => {
        try {
            // Validate input parameters
            if (!isValidRoomCode(room) || !isValidPlayerName(name)) {
                socket.emit(SERVER_EVENTS.JOIN_ROOM_ERROR);
                return;
            }

            const roomExists = await roomRepo.exists(room);

            socket.join(room);

            // If room does not exist, emit error + leave room
            if (!roomExists) {
                socket.emit(SERVER_EVENTS.JOIN_ROOM_ERROR);
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
                    socket.emit(SERVER_EVENTS.PVP_ROOM_FULL);
                    socket.leave(room);
                    return;
                }
            }

            await addPlayerToRoom(room, socket.id, name, socket.handshake.auth?.sessionId);

            // For PVP mode, check if this player is the host
            const isHost = mode === 'pvp' && roomState.hostSocket === socket.id;
            // Include difficulty config so joining players can set their flag counter correctly
            socket.emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, {
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
                    io.to(hostSocket).emit(SERVER_EVENTS.PVP_ROOM_READY, {
                        opponentName: guestName,
                        isHost: true
                    });
                    io.to(guestSocket).emit(SERVER_EVENTS.PVP_ROOM_READY, {
                        opponentName: hostName,
                        isHost: false
                    });
                }
            }
        } catch (error) {
            console.error('Error in joinRoom:', error);
            socket.emit(SERVER_EVENTS.JOIN_ROOM_ERROR);
            socket.leave(room);
        }
    });

    const isValid = async (room) => {
        const roomExists = await roomRepo.exists(room);
        const playerExists = await playerRepo.exists(socket.id);
        if (!roomExists || !playerExists) {
            socket.emit(SERVER_EVENTS.ROOM_DOES_NOT_EXIST_ERROR);
            socket.leave(room);
            return false;
        }

        // Verify player is actually in the room's player list
        const roomState = await roomRepo.getState(room);
        if (!isPlayerInRoom(roomState, socket.id)) {
            socket.emit(SERVER_EVENTS.ROOM_DOES_NOT_EXIST_ERROR);
            socket.leave(room);
            return false;
        }

        return true;
    }

    // When a player opens a cell
    socket.on(CLIENT_EVENTS.OPEN_CELL, async ({ room, row, col }) => {
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

    socket.on(CLIENT_EVENTS.CHORD_CELL, async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!isValidRoomCode(room) || !isValidCoordinate(row, col)) return;

            if (!(await isValid(room))) return;
            await chordCell(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in chordCell:', error);
        }
    });

    socket.on(CLIENT_EVENTS.TOGGLE_FLAG, async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!isValidRoomCode(room) || !isValidCoordinate(row, col)) return;

            if (!(await isValid(room))) return;
            await toggleFlag(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in toggleFlag:', error);
        }
    });

    socket.on(CLIENT_EVENTS.EMIT_CONFETTI, async ({ room }) => {
        try {
            // Validate input parameters
            if (!isValidRoomCode(room)) return;

            if (!(await isValid(room))) return;
            io.to(room).emit(SERVER_EVENTS.RECEIVE_CONFETTI);
        } catch (error) {
            console.error('Error in emitConfetti:', error);
        }
    })

    socket.on(CLIENT_EVENTS.CELL_HOVER, async ({ room, row, col }) => {
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
            socket.to(room).emit(SERVER_EVENTS.PLAYER_HOVER_UPDATE, { 
                id: socket.id, 
                row, 
                col, 
                name: playerName 
            });
        } catch (error) {
            console.error('Error in cellHover:', error);
        }
    });

    socket.on(CLIENT_EVENTS.RESET_GAME, async ({ room }) => {
        try {
            // Validate input parameters
            if (!isValidRoomCode(room)) return;

            if (!(await isValid(room))) return;
            await resetGame(room);
        } catch (error) {
            console.error('Error in resetGame:', error);
        }
    });

    socket.on(CLIENT_EVENTS.START_PVP_GAME, async ({ room }) => {
        await startPvpGame({ socket, room, isValid, io });
    });

    socket.on(CLIENT_EVENTS.RESET_MY_BOARD, async ({ room }) => {
        await resetMyBoard({ socket, room, isValid, io });
    });

    socket.on(CLIENT_EVENTS.PVP_REMATCH, async ({ room }) => {
        await pvpRematch({ socket, room, isValid, io });
    });

    socket.on(CLIENT_EVENTS.PLAYER_LEAVE, async () => {
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
