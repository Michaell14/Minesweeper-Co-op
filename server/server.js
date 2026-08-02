const { server, io } = require('./utils/initializeClient');
const { removePlayer, addPlayerToRoom } = require('./utils/playerUtils');
const { createRoom, resetGame } = require('./utils/gameUtils');
const { openCell, chordCell, toggleFlag } = require('./game');
const { startPvpGame, resetMyBoard, pvpRematch } = require('./controllers/pvpController');
const { offerResume, forgetRoom } = require('./controllers/sessionController');
const { startDaily, submitDailyScore, getDailyLeaderboard } = require('./controllers/dailyController');
const dailyGame = require('./game/daily');
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
    isValidDailyToken,
    isValidDailyDate,
} = require('./validation');

io.on('connection', async (socket) => {
    socket.on(CLIENT_EVENTS.CREATE_ROOM, async ({ room, numRows, numCols, numMines, name, mode }) => {
        try {
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
            if (roomExists) {
                socket.emit(SERVER_EVENTS.CREATE_ROOM_ERROR);
                return;
            }
            socket.join(room);

            await createRoom(room, numRows, numCols, numMines, mode);

            // In PVP the creator is the host.
            if (mode === 'pvp') {
                await roomRepo.setFields(room, { hostSocket: socket.id });
            }

            await addPlayerToRoom(room, socket.id, name, socket.handshake.auth?.sessionId);
            io.to(room).emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, { room, mode, isHost: mode === 'pvp' });
        } catch (error) {
            console.error('Error in createRoom:', error);
            socket.emit(SERVER_EVENTS.CREATE_ROOM_ERROR);
        }
    })

    socket.on(CLIENT_EVENTS.JOIN_ROOM, async ({ room, name }) => {
        try {
            if (!isValidRoomCode(room) || !isValidPlayerName(name)) {
                socket.emit(SERVER_EVENTS.JOIN_ROOM_ERROR);
                return;
            }

            const roomExists = await roomRepo.exists(room);

            socket.join(room);

            if (!roomExists) {
                socket.emit(SERVER_EVENTS.JOIN_ROOM_ERROR);
                socket.leave(room);
                return;
            }

            const roomState = await roomRepo.getState(room);
            const mode = roomState.mode || 'co-op';

            // A PVP room holds two, and a reconnecting player is not a third.
            if (mode === 'pvp') {
                const players = roomRepo.playersFrom(roomState);
                const isReconnecting = players.includes(socket.id);

                if (!isReconnecting && players.length >= 2) {
                    socket.emit(SERVER_EVENTS.PVP_ROOM_FULL);
                    socket.leave(room);
                    return;
                }
            }

            await addPlayerToRoom(room, socket.id, name, socket.handshake.auth?.sessionId);

            const isHost = mode === 'pvp' && roomState.hostSocket === socket.id;
            // The dimensions come along so the joiner's flag counter is right.
            socket.emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, {
                room,
                mode,
                isHost,
                numRows: parseInt(roomState.numRows),
                numCols: parseInt(roomState.numCols),
                numMines: parseInt(roomState.numMines)
            });

            if (mode === 'pvp') {
                const updatedPlayers = await roomRepo.getPlayers(room);
                if (updatedPlayers.length === 2) {
                    const hostSocket = roomState.hostSocket;
                    const guestSocket = updatedPlayers.find(p => p !== hostSocket);
                    const hostName = await playerRepo.getName(hostSocket);
                    const guestName = await playerRepo.getName(guestSocket);

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

        const roomState = await roomRepo.getState(room);
        if (!isPlayerInRoom(roomState, socket.id)) {
            socket.emit(SERVER_EVENTS.ROOM_DOES_NOT_EXIST_ERROR);
            socket.leave(room);
            return false;
        }

        return true;
    }

    socket.on(CLIENT_EVENTS.OPEN_CELL, async ({ room, row, col }) => {
        try {
            if (!isValidRoomCode(room) || !isValidCoordinate(row, col)) return;

            // Catches a click on a room that timed out and was deleted.
            if (!(await isValid(room))) return;
            await openCell(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in openCell:', error);
        }
    });

    socket.on(CLIENT_EVENTS.CHORD_CELL, async ({ room, row, col }) => {
        try {
            if (!isValidRoomCode(room) || !isValidCoordinate(row, col)) return;

            if (!(await isValid(room))) return;
            await chordCell(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in chordCell:', error);
        }
    });

    socket.on(CLIENT_EVENTS.TOGGLE_FLAG, async ({ room, row, col }) => {
        try {
            if (!isValidRoomCode(room) || !isValidCoordinate(row, col)) return;

            if (!(await isValid(room))) return;
            await toggleFlag(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in toggleFlag:', error);
        }
    });

    socket.on(CLIENT_EVENTS.EMIT_CONFETTI, async ({ room }) => {
        try {
            if (!isValidRoomCode(room)) return;

            if (!(await isValid(room))) return;
            io.to(room).emit(SERVER_EVENTS.RECEIVE_CONFETTI);
        } catch (error) {
            console.error('Error in emitConfetti:', error);
        }
    })

    socket.on(CLIENT_EVENTS.CELL_HOVER, async ({ room, row, col }) => {
        try {
            // row/col of -1 means "no hover".
            if (!isValidRoomCode(room) || !isValidHoverCoordinate(row, col)) return;

            // Membership is re-checked inline rather than via `isValid`: this
            // must not emit an error or drop the socket, only refuse the spam.
            const roomExists = await roomRepo.exists(room);
            const playerExists = await playerRepo.exists(socket.id);
            if (!roomExists || !playerExists) return;

            const roomState = await roomRepo.getState(room);
            if (!isPlayerInRoom(roomState, socket.id)) return;

            // PVP racers must not see each other's cursor.
            if (roomState.mode === 'pvp') return;

            const playerName = await playerRepo.getName(socket.id);
            if (!playerName) return;

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

    // --- Daily challenge: NOT room-scoped, see server/data/keys.js ---

    socket.on(CLIENT_EVENTS.START_DAILY, async ({ dailyAttemptToken }) => {
        await startDaily({ socket, dailyAttemptToken });
    });

    socket.on(CLIENT_EVENTS.DAILY_OPEN_CELL, async ({ dailyAttemptToken, date, row, col }) => {
        try {
            if (!isValidDailyToken(dailyAttemptToken) || !isValidDailyDate(date) || !isValidCoordinate(row, col)) return;
            await dailyGame.openCell(date, dailyAttemptToken, socket.id, row, col);
        } catch (error) {
            console.error('Error in dailyOpenCell:', error);
        }
    });

    socket.on(CLIENT_EVENTS.DAILY_CHORD_CELL, async ({ dailyAttemptToken, date, row, col }) => {
        try {
            if (!isValidDailyToken(dailyAttemptToken) || !isValidDailyDate(date) || !isValidCoordinate(row, col)) return;
            await dailyGame.chordCell(date, dailyAttemptToken, socket.id, row, col);
        } catch (error) {
            console.error('Error in dailyChordCell:', error);
        }
    });

    socket.on(CLIENT_EVENTS.DAILY_TOGGLE_FLAG, async ({ dailyAttemptToken, date, row, col }) => {
        try {
            if (!isValidDailyToken(dailyAttemptToken) || !isValidDailyDate(date) || !isValidCoordinate(row, col)) return;
            await dailyGame.toggleFlag(date, dailyAttemptToken, socket.id, row, col);
        } catch (error) {
            console.error('Error in dailyToggleFlag:', error);
        }
    });

    socket.on(CLIENT_EVENTS.SUBMIT_DAILY_SCORE, async ({ dailyAttemptToken, date, name }) => {
        if (!isValidDailyToken(dailyAttemptToken) || !isValidDailyDate(date)) return;
        await submitDailyScore({ socket, io, dailyAttemptToken, date, name });
    });

    socket.on(CLIENT_EVENTS.GET_DAILY_LEADERBOARD, async ({ date }) => {
        if (!isValidDailyDate(date)) return;
        await getDailyLeaderboard({ socket, date });
    });

    socket.on(CLIENT_EVENTS.PLAYER_LEAVE, async () => {
        // Two independent jobs, so two independent try/catch blocks. Sharing one
        // meant a Redis blip in forgetRoom skipped removePlayer entirely — and
        // leaving does NOT disconnect the socket, so the leaver stayed in the
        // room, still scored and still counted, with their screen already home.
        try {
            // Walking out on purpose is the one exit that must not be resumed.
            // `disconnect` below runs the same removePlayer and deliberately
            // leaves the session's room intact, which is what a reload rides.
            await forgetRoom(socket);
        } catch (error) {
            // Resume stays armed, but that must not cost them the leave as well.
            console.error('Error forgetting room on playerLeave:', error);
        }

        try {
            await removePlayer(socket, socket.id);
        } catch (error) {
            console.error('Error removing player on playerLeave:', error);
        }
    });

    socket.on('disconnect', async () => {
        try {
            await removePlayer(socket, socket.id);
        } catch (error) {
            console.error('Error in disconnect:', error);
        }
    });

    // Last, deliberately: this can prompt the client to send `joinRoom` straight
    // back, and the handler for it has to already exist when that lands.
    try {
        await offerResume(socket);
    } catch (error) {
        console.error('Error offering session resume:', error);
    }
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
