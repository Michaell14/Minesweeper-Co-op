/**
 * Quick match: pairs two strangers into an ORDINARY PVP room. The queue is a
 * way in, not a fourth mode: lobby, `startPvpGame`, forfeit grace, rematch and
 * reconnect run untouched, and a pairing is announced with the same
 * `joinRoomSuccess` + `pvpRoomReady` a hand-made room sends. One fixed board
 * (`DEFAULT_PRESET`): per-size queues at this traffic would all be empty.
 */

const crypto = require('crypto');
const { io } = require('../utils/initializeClient');
const { createRoom } = require('../utils/gameUtils');
const { addPlayerToRoom } = require('../utils/playerUtils');
const { isValidPlayerName } = require('../validation');
const { displayNameFor } = require('../utils/playerIdentity');
const { DEFAULT_PRESET } = require('../../shared/boardConfig');
const { MATCH_ENTRY_STALE_MS } = require('../data/keys');
const matchRepo = require('../data/matchRepo');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { SERVER_EVENTS } = require('../../shared/events');

/** The room code a match plays under. No ambiguous glyphs: the code is shown and passed on. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const CODE_ATTEMPTS = 5;

const randomCode = (prefix) => {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return `${prefix}-${code}`;
};

/**
 * A code no live room holds. Collision-checked because room codes are user
 * text, so `QM-ABC123` can exist by hand. Throws; the caller answers `matchError`.
 */
const mintRoomCode = async (prefix) => {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
        const code = randomCode(prefix);
        if (!(await roomRepo.exists(code))) return code;
    }
    throw new Error(`Could not mint a free ${prefix} room code`);
};

/** Whether this socket is still connected to THIS process. */
const isConnected = (socketId) => Boolean(io.sockets?.sockets?.get(socketId));

/**
 * Connected sockets other than `socketId`, local to this process. Not a queue
 * depth: the queue never holds two, since an arrival pairs with whoever is
 * there. Total and "is that me" read the SAME map, so on the disconnect path a
 * leaver cannot be counted by a tally that has not caught up.
 */
const othersOnline = (socketId) =>
    Math.max(0, (io.sockets?.sockets?.size ?? 0) - (isConnected(socketId) ? 1 : 0));

/**
 * Re-sends the count to everyone waiting, on every connect and disconnect:
 * `matchSearching` fires once, and the dialog then sits for minutes. Cheap (at
 * most one waiter, this process only) and never throws, since it sits on the
 * connect and disconnect paths.
 */
const broadcastOnlineCount = async () => {
    try {
        for (const entry of await matchRepo.listWaiting()) {
            if (!isConnected(entry.socketId)) continue;
            io.to(entry.socketId).emit(SERVER_EVENTS.MATCH_ONLINE_COUNT, {
                othersOnline: othersOnline(entry.socketId),
            });
        }
    } catch (error) {
        console.error('Error broadcasting the online count:', error);
    }
};

/**
 * Whether a queued entry can still be paired: not stale, still connected here,
 * and not in a room (a player record existing IS being in a room).
 */
const isPairable = async (entry, now) => {
    if (now - entry.queuedAt > MATCH_ENTRY_STALE_MS) return false;
    if (!isConnected(entry.socketId)) return false;
    return !(await playerRepo.exists(entry.socketId));
};

/** Takes the longest-waiting pairable player, pruning rejects. Runs under the match lock. */
const takePartner = async (socketId) => {
    const waiting = await matchRepo.listWaiting();
    const now = Date.now();

    for (const entry of waiting) {
        // Their own earlier entry; the enqueue below overwrites it.
        if (entry.socketId === socketId) continue;

        if (!(await isPairable(entry, now))) {
            await matchRepo.remove(entry.socketId);
            continue;
        }

        await matchRepo.remove(entry.socketId);
        return entry;
    }

    return null;
};

/**
 * Builds the room and puts both players in it. The waiting player is host.
 * `socket.join` before `addPlayerToRoom`, which broadcasts to the room.
 */
const startMatch = async ({ host, hostSocket, guestSocket, guestName, guestSessionId }) => {
    const room = await mintRoomCode('QM');
    const { rows, cols, mines } = DEFAULT_PRESET;

    try {
        await createRoom(room, rows, cols, mines, 'pvp');
        await roomRepo.setFields(room, { hostSocket: hostSocket.id });

        hostSocket.join(room);
        guestSocket.join(room);

        await addPlayerToRoom(room, hostSocket.id, host.name, host.sessionId, hostSocket.data?.user?.avatar);
        await addPlayerToRoom(room, guestSocket.id, guestName, guestSessionId, guestSocket.data?.user?.avatar);

        // Dimensions travel as on a manual join: the flag counter is client-side.
        const joined = { room, mode: 'pvp', numRows: rows, numCols: cols, numMines: mines };
        io.to(hostSocket.id).emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, { ...joined, isHost: true });
        io.to(guestSocket.id).emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, { ...joined, isHost: false });

        // Read back so the opponent sees the validated stored avatar, as on join.
        const hostAvatar = await playerRepo.getAvatar(hostSocket.id);
        const guestAvatar = await playerRepo.getAvatar(guestSocket.id);
        io.to(hostSocket.id).emit(SERVER_EVENTS.PVP_ROOM_READY, { opponentName: guestName, opponentAvatar: guestAvatar, isHost: true });
        io.to(guestSocket.id).emit(SERVER_EVENTS.PVP_ROOM_READY, { opponentName: host.name, opponentAvatar: hostAvatar, isHost: false });

        return room;
    } catch (error) {
        // A leftover player record reads as "in a room" and blocks any retry.
        hostSocket.leave(room);
        guestSocket.leave(room);
        await playerRepo.remove(hostSocket.id).catch(() => {});
        await playerRepo.remove(guestSocket.id).catch(() => {});
        throw error;
    }
};

/** Handles 'findMatch'. */
const findMatch = async ({ socket, name }) => {
    try {
        // Validate the name as it will be STORED, same as createRoom/joinRoom.
        const displayName = displayNameFor(socket, name);
        if (!isValidPlayerName(displayName)) {
            socket.emit(SERVER_EVENTS.MATCH_ERROR);
            return;
        }

        // Already in a room: pairing them would move them off a board mid-game.
        if (await playerRepo.exists(socket.id)) {
            socket.emit(SERVER_EVENTS.MATCH_ERROR);
            return;
        }

        const sessionId = socket.handshake.auth?.sessionId;

        /*
         * "Take a waiter, else wait" is ONE decision: unlocked, two arrivals
         * both read an empty queue and both sit down, each waiting for the
         * other. Only the decision is locked; the partner is out of the queue
         * before the room is built.
         */
        const partner = await matchRepo.withMatchLock(socket.id, async () => {
            const found = await takePartner(socket.id);
            if (found) return found;

            await matchRepo.enqueue(socket.id, {
                name: displayName,
                sessionId,
                queuedAt: Date.now(),
            });
            return null;
        });

        if (!partner) {
            socket.emit(SERVER_EVENTS.MATCH_SEARCHING, { othersOnline: othersOnline(socket.id) });
            return;
        }

        const partnerSocket = io.sockets?.sockets?.get(partner.socketId);
        if (!partnerSocket) {
            // Dropped since the liveness check; rare enough to re-search rather than loop.
            await matchRepo.enqueue(socket.id, { name: displayName, sessionId, queuedAt: Date.now() });
            socket.emit(SERVER_EVENTS.MATCH_SEARCHING, { othersOnline: othersOnline(socket.id) });
            return;
        }

        try {
            await startMatch({
                host: partner,
                hostSocket: partnerSocket,
                guestSocket: socket,
                guestName: displayName,
                guestSessionId: sessionId,
            });
        } catch (error) {
            // The partner was dequeued and told nothing: put them back.
            console.error('Error starting match:', error);
            await matchRepo.enqueue(partner.socketId, partner);
            socket.emit(SERVER_EVENTS.MATCH_ERROR);
        }
    } catch (error) {
        console.error('Error in findMatch:', error);
        socket.emit(SERVER_EVENTS.MATCH_ERROR);
    }
};

/**
 * Handles 'startPracticeRace': a co-op room of one, which the app already
 * supports, so generation, cell actions, clock, win check and best times all
 * work untouched. The "opponent" is drawn by the CLIENT from a target time in
 * its own records; in PVP the opponent is only ever a percentage on a bar, so
 * it renders identically. The clear is a real solo clear and counts as one.
 */
const startPracticeRace = async ({ socket, name }) => {
    try {
        const displayName = displayNameFor(socket, name);
        if (!isValidPlayerName(displayName)) {
            socket.emit(SERVER_EVENTS.MATCH_ERROR);
            return;
        }

        if (await playerRepo.exists(socket.id)) {
            socket.emit(SERVER_EVENTS.MATCH_ERROR);
            return;
        }

        // Taking the practice board leaves the queue, before a slow creation could leave them pairable.
        await matchRepo.remove(socket.id);

        const room = await mintRoomCode('SOLO');
        const { rows, cols, mines } = DEFAULT_PRESET;

        await createRoom(room, rows, cols, mines, 'co-op');
        /*
         * Room CONFIGURATION, like `mode` and `noGuess`: how the room was
         * opened, nothing more (the server has no target). Stored so a reload
         * finds its way back: a resume re-joins through `joinRoom`, which
         * knows only what the room says.
         */
        await roomRepo.setFields(room, { practice: 'true' });
        socket.join(room);
        await addPlayerToRoom(room, socket.id, displayName, socket.handshake.auth?.sessionId);

        socket.emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, {
            room,
            mode: 'co-op',
            numRows: rows,
            numCols: cols,
            numMines: mines,
            practice: true,
        });
    } catch (error) {
        console.error('Error in startPracticeRace:', error);
        socket.emit(SERVER_EVENTS.MATCH_ERROR);
    }
};

/** Handles 'cancelMatch' — the player pressing Cancel in the searching dialog. */
const cancelMatch = async ({ socket }) => {
    try {
        await matchRepo.remove(socket.id);
    } catch (error) {
        console.error('Error in cancelMatch:', error);
    }
    // Emitted either way: the client is waiting to leave the dialog, and a
    // surviving entry is pruned later (see isPairable).
    socket.emit(SERVER_EVENTS.MATCH_CANCELLED);
};

/** Silent cleanup for a departing socket. Never throws: it sits ahead of `removePlayer` on disconnect. */
const leaveQueue = async (socket) => {
    try {
        await matchRepo.remove(socket.id);
    } catch (error) {
        console.error('Error removing from match queue:', error);
    }
};

module.exports = { findMatch, cancelMatch, startPracticeRace, leaveQueue, broadcastOnlineCount };
