/**
 * Room lifecycle — the three routes that own their own refusals.
 *
 * Unlike everything else in the table these keep their validation and their
 * try/catch inside the handler, because a refusal here owes the client a
 * SPECIFIC error (`createRoomError` vs `joinRoomError` vs `pvpRoomFull`) and
 * often a `socket.leave` with it. The registrar's silent refusal is right for a
 * cell action and wrong for a failed join, so these routes declare
 * `GUARDS.NONE` and answer for themselves.
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
        // Whitespace is not part of a name. The browser sends what was typed,
        // and anything speaking the protocol directly sends whatever it likes.
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
        // `practice` likewise: a reload resumes through THIS handler, and
        // without it the board, clock and score all came back while the
        // target the player was racing silently did not.
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
 * Two independent jobs, so two independent try/catch blocks. Sharing one meant
 * a Redis blip in forgetRoom skipped removePlayer entirely — and leaving does
 * NOT disconnect the socket, so the leaver stayed in the room, still scored and
 * still counted, with their screen already home.
 */
const leave = async ({ socket }) => {
    try {
        // Walking out on purpose is the one exit that must not be resumed.
        // `disconnect` runs the same removePlayer and deliberately leaves the
        // session's room intact, which is what a reload rides.
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
