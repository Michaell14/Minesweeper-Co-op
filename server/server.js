const express = require('express');
const { app, server, io } = require('./utils/initializeClient');
const { removePlayer, addPlayerToRoom } = require('./utils/playerUtils');
const { createRoom, resetGame } = require('./utils/gameUtils');
const { openCell, chordCell, toggleFlag } = require('./game');
const { startPvpGame, resetMyBoard, pvpRematch } = require('./controllers/pvpController');
const { offerResume, forgetRoom } = require('./controllers/sessionController');
const { findMatch, cancelMatch, startPracticeRace, leaveQueue } = require('./controllers/matchmakingController');
const { resolveSocketUser, registerProfileRoutes } = require('./controllers/profileController');
const { registerSettingsRoutes } = require('./controllers/settingsController');
const { registerThemesRoutes } = require('./controllers/themesController');
const { registerStatsRoutes } = require('./controllers/statsController');
const { startDaily, submitDailyScore, getDailyLeaderboard } = require('./controllers/dailyController');
const dailyGame = require('./game/daily');
const { PORT } = require('./config');
const roomRepo = require('./data/roomRepo');
const playerRepo = require('./data/playerRepo');
const sessionRepo = require('./data/sessionRepo');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('../shared/events');
const {
    isValidRoomCode,
    isValidPlayerName,
    normalizePlayerName,
    isValidMode,
    isValidBoardConfig,
    isValidCoordinate,
    isValidHoverCoordinate,
    isPlayerInRoom,
    isValidDailyToken,
    isValidDailyDate,
} = require('./validation');

// The account routes — the server's first HTTP surface beyond health checks.
// The JSON body parser is mounted here, ONCE, ahead of every registration:
// scoped to /api (nothing else on this server reads a body), and owned by no
// particular controller so registration order stays order, not load-bearing.
app.use('/api', express.json());
registerProfileRoutes(app);
registerSettingsRoutes(app);
registerThemesRoutes(app);
registerStatsRoutes(app);

/**
 * Who this socket belongs to, resolved once at connect. `null` is an anonymous
 * player — fully supported, and the guaranteed outcome when the token is
 * absent, invalid, or the database is missing; auth being down never blocks a
 * connection. Skipped on connection-state recovery (`skipMiddlewares: true`),
 * where the previous `socket.data` is restored instead.
 *
 * This is a CONNECT-TIME SNAPSHOT: a rename or deletion mid-session does not
 * update it until the socket reconnects. Consumers that show the name
 * somewhere durable re-read it (dailyController.submitDailyScore); stats
 * writes for a deleted account fail the users FK and are dropped by
 * statsRecorder, which is the intended outcome.
 */
io.use(async (socket, next) => {
    socket.data.user = await resolveSocketUser(socket.handshake.auth);
    next();
});

io.on('connection', async (socket) => {
    socket.on(CLIENT_EVENTS.CREATE_ROOM, async ({ room, numRows, numCols, numMines, name, mode }) => {
        try {
            // Validate the name as it will be STORED — see joinRoom below.
            const displayName = normalizePlayerName(name);
            if (
                !isValidRoomCode(room) ||
                !isValidPlayerName(displayName) ||
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

            await addPlayerToRoom(room, socket.id, displayName, socket.handshake.auth?.sessionId);
            io.to(room).emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, { room, mode, isHost: mode === 'pvp' });
        } catch (error) {
            console.error('Error in createRoom:', error);
            socket.emit(SERVER_EVENTS.CREATE_ROOM_ERROR);
        }
    })

    socket.on(CLIENT_EVENTS.JOIN_ROOM, async ({ room, name }) => {
        try {
            // Whitespace is not part of a name. The browser sends what was
            // typed, and anything speaking the protocol directly sends whatever
            // it likes.
            const displayName = normalizePlayerName(name);
            if (!isValidRoomCode(room) || !isValidPlayerName(displayName)) {
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

            const sessionId = socket.handshake.auth?.sessionId;
            const roomState = await roomRepo.getState(room);
            const mode = roomState.mode || 'co-op';

            /*
             * A PVP room holds two, and a reconnecting player is not a third.
             *
             * Their socket id is new, so the players list cannot recognise them
             * — it still holds the id they arrived under last time, if their
             * disconnect has not been processed yet. Asking the SESSION is what
             * the reconnect itself is keyed on, and without it a fast reload was
             * turned away from its own room with "Room Full!".
             *
             * The capacity check and the join that follows it are one decision,
             * so they are serialised: unlocked, two people opening the same
             * invite together both read a room with space and both take it,
             * leaving three players in a room `startPvpGame` will then refuse to
             * start, permanently.
             */
            if (mode === 'pvp') {
                const previousSocketId = sessionId ? await sessionRepo.getSocketId(sessionId) : null;

                const admitted = await roomRepo.withJoinLock(room, socket.id, async () => {
                    const players = roomRepo.playersFrom(await roomRepo.getState(room));
                    const isReconnecting =
                        players.includes(socket.id) ||
                        Boolean(previousSocketId && players.includes(previousSocketId));

                    if (!isReconnecting && players.length >= 2) return false;

                    await addPlayerToRoom(room, socket.id, displayName, sessionId);
                    return true;
                });

                if (!admitted) {
                    socket.emit(SERVER_EVENTS.PVP_ROOM_FULL);
                    socket.leave(room);
                    return;
                }
            } else {
                await addPlayerToRoom(room, socket.id, displayName, sessionId);
            }

            /*
             * Re-read, because `addPlayerToRoom` may have just changed who the
             * host is: a reconnecting host keeps the role, so `hostSocket` is
             * repointed at THIS socket. The snapshot above still names the one
             * that dropped, and describing the room from it broke a reloaded
             * host's lobby twice over — they were told `isHost: false`, and the
             * guest lookup below compared against an id no longer in the players
             * list, so it picked the host as their own opponent.
             */
            const joinedState = await roomRepo.getState(room);
            const isHost = mode === 'pvp' && joinedState.hostSocket === socket.id;
            // The dimensions come along so the joiner's flag counter is right.
            socket.emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, {
                room,
                mode,
                isHost,
                numRows: parseInt(joinedState.numRows),
                numCols: parseInt(joinedState.numCols),
                numMines: parseInt(joinedState.numMines)
            });

            if (mode === 'pvp') {
                const updatedPlayers = await roomRepo.getPlayers(room);
                if (updatedPlayers.length === 2) {
                    const hostSocket = joinedState.hostSocket;
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

    // --- Matchmaking: pre-room, so neither handler takes a room code ---

    socket.on(CLIENT_EVENTS.FIND_MATCH, async ({ name }) => {
        await findMatch({ socket, name });
    });

    socket.on(CLIENT_EVENTS.CANCEL_MATCH, async () => {
        await cancelMatch({ socket });
    });

    socket.on(CLIENT_EVENTS.START_PRACTICE_RACE, async ({ name }) => {
        await startPracticeRace({ socket, name });
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
        // Closing the tab while queued is the ordinary way to leave the queue,
        // so this is the cleanup path that carries the weight. `playerLeave` is
        // deliberately NOT hooked: being in a room and being in the queue are
        // mutually exclusive (findMatch refuses a socket that already has a
        // player record), so there is nothing there to remove.
        await leaveQueue(socket);

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
