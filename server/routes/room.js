/**
 * Room lifecycle — the three routes that own their own refusals. They keep
 * validation and try/catch inside the handler because a refusal here owes the
 * client a SPECIFIC error (`createRoomError`, `joinRoomError`, `pvpRoomFull`)
 * and often a `socket.leave`, so they declare `GUARDS.NONE`.
 */

const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const sessionRepo = require('../data/sessionRepo');
const { createRoom: createRoomState } = require('../utils/gameUtils');
const { addPlayerToRoom, removePlayer } = require('../utils/playerUtils');
const { forgetRoom } = require('../controllers/sessionController');
const { displayNameFor } = require('../utils/playerIdentity');
const { isValidRoomCode, isValidPlayerName, isValidBoardConfig, isValidMode } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

const create = async ({ socket, io, payload }) => {
    const { room, numRows, numCols, numMines, name, mode } = payload;
    try {
        // Validate the name as it will be STORED — see join below.
        const displayName = displayNameFor(socket, name);
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

        await createRoomState(room, numRows, numCols, numMines, mode);

        // In PVP the creator is the host.
        if (mode === 'pvp') {
            await roomRepo.setFields(room, { hostSocket: socket.id });
        }

        await addPlayerToRoom(room, socket.id, displayName, socket.handshake.auth?.sessionId, socket.data?.user?.avatar);
        io.to(room).emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, { room, mode, isHost: mode === 'pvp' });
    } catch (error) {
        console.error('Error in createRoom:', error);
        socket.emit(SERVER_EVENTS.CREATE_ROOM_ERROR);
    }
};

const join = async ({ socket, io, payload }) => {
    const { room, name } = payload;
    try {
        // Whitespace is not part of a name; anything speaking the protocol sends what it likes.
        const displayName = displayNameFor(socket, name);
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
         * A PVP room holds two, and a reconnecting player is not a third. Their
         * socket id is new, so the players list cannot recognise them; the
         * SESSION is what the reconnect is keyed on. The capacity check and the
         * join are one decision, so they are serialised: unlocked, two people
         * opening the same invite both find space and both take it.
         */
        if (mode === 'pvp') {
            const previousSocketId = sessionId ? await sessionRepo.getSocketId(sessionId) : null;

            const admitted = await roomRepo.withJoinLock(room, socket.id, async () => {
                const players = roomRepo.playersFrom(await roomRepo.getState(room));
                const isReconnecting =
                    players.includes(socket.id) ||
                    Boolean(previousSocketId && players.includes(previousSocketId));

                if (!isReconnecting && players.length >= 2) return false;

                await addPlayerToRoom(room, socket.id, displayName, sessionId, socket.data?.user?.avatar);
                return true;
            });

            if (!admitted) {
                socket.emit(SERVER_EVENTS.PVP_ROOM_FULL);
                socket.leave(room);
                return;
            }
        } else {
            await addPlayerToRoom(room, socket.id, displayName, sessionId, socket.data?.user?.avatar);
        }

        /*
         * Re-read: `addPlayerToRoom` may have repointed `hostSocket` at THIS
         * socket for a reconnecting host. The snapshot above still names the
         * one that dropped, which told a reloaded host `isHost: false`.
         */
        const joinedState = await roomRepo.getState(room);
        const isHost = mode === 'pvp' && joinedState.hostSocket === socket.id;
        // Dimensions so the joiner's flag counter is right; `practice` because a
        // reload resumes through THIS handler and would otherwise lose the target.
        socket.emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, {
            room,
            mode,
            isHost,
            numRows: parseInt(joinedState.numRows),
            numCols: parseInt(joinedState.numCols),
            numMines: parseInt(joinedState.numMines),
            ...(joinedState.practice === 'true' && { practice: true })
        });

        if (mode === 'pvp') {
            const updatedPlayers = await roomRepo.getPlayers(room);
            if (updatedPlayers.length === 2) {
                const hostSocket = joinedState.hostSocket;
                const guestSocket = updatedPlayers.find(p => p !== hostSocket);
                const hostName = await playerRepo.getName(hostSocket);
                const guestName = await playerRepo.getName(guestSocket);
                const hostAvatar = await playerRepo.getAvatar(hostSocket);
                const guestAvatar = await playerRepo.getAvatar(guestSocket);

                io.to(hostSocket).emit(SERVER_EVENTS.PVP_ROOM_READY, {
                    opponentName: guestName,
                    opponentAvatar: guestAvatar,
                    isHost: true
                });
                io.to(guestSocket).emit(SERVER_EVENTS.PVP_ROOM_READY, {
                    opponentName: hostName,
                    opponentAvatar: hostAvatar,
                    isHost: false
                });
            }
        }
    } catch (error) {
        console.error('Error in joinRoom:', error);
        socket.emit(SERVER_EVENTS.JOIN_ROOM_ERROR);
        socket.leave(room);
    }
};

/**
 * Two independent jobs, two try/catch blocks. Sharing one meant a Redis blip
 * in forgetRoom skipped removePlayer, leaving the leaver in the room.
 */
const leave = async ({ socket }) => {
    try {
        // Walking out on purpose is the one exit that must not be resumed;
        // `disconnect` leaves the session's room intact for a reload.
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
};

module.exports = { create, join, leave };
