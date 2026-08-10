/**
 * Quick match: pair two strangers into a PVP room without a shared room code.
 *
 * This builds a room and nothing else. Once both players are in it they are in
 * an ORDINARY PVP room — the lobby, `startPvpGame`, the shared board, the
 * forfeit grace period, rematch and reconnect all run untouched, and none of
 * them can tell a matched room from a hand-made one. That is the whole design:
 * the queue is a way IN, not a fourth game mode.
 *
 * A pairing is therefore announced as the same `joinRoomSuccess` +
 * `pvpRoomReady` a hand-made room sends, so the client has one code path for
 * both and there is no `matchFound` to keep in step.
 *
 * **Quick match plays one fixed board** (`DEFAULT_PRESET`). Queueing per
 * size and difficulty would be twelve queues, and twelve queues at this traffic
 * level are twelve empty ones — see data/keys.js.
 */

const crypto = require('crypto');
const { io } = require('../utils/initializeClient');
const { createRoom } = require('../utils/gameUtils');
const { addPlayerToRoom } = require('../utils/playerUtils');
const { isValidPlayerName, normalizePlayerName } = require('../validation');
const { DEFAULT_PRESET } = require('../../shared/boardConfig');
const { MATCH_ENTRY_STALE_MS } = require('../data/keys');
const matchRepo = require('../data/matchRepo');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * The room code a match plays under. Ambiguous glyphs are left out because this
 * code IS shown — the room panel prints it, and a matched player can pass it to
 * a friend for the rematch like any other.
 */
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
 * A code no live room holds.
 *
 * Collision-checked rather than trusted: room codes are arbitrary user text, so
 * nothing stops a player creating `QM-ABC123` by hand, and taking over their
 * room would be a real failure rather than a cosmetic one. Throws instead of
 * returning a duplicate — the caller answers with `matchError`.
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
 * Connected sockets other than `socketId`.
 *
 * NOT a queue depth — the queue can never hold two waiting players, since
 * anyone arriving pairs with whoever is already there. "Is anyone here at all"
 * is the only honest signal, and it is what decides whether waiting is worth
 * it. Local to this process, like every other socket count here.
 *
 * The total and the "is that me" subtraction read the SAME map, so they cannot
 * disagree about a socket. That matters on the disconnect path, where this is
 * called for a leaver: `io.engine.clientsCount` is a second tally kept
 * elsewhere, and one that had not caught up would leave the survivors reading a
 * player who is already gone, with no further event coming to correct it.
 */
const othersOnline = (socketId) =>
    Math.max(0, (io.sockets?.sockets?.size ?? 0) - (isConnected(socketId) ? 1 : 0));

/**
 * Re-sends the count to everyone still waiting.
 *
 * Called on every connect and disconnect, because the number moves while the
 * dialog showing it stands still: `matchSearching` fires once, at the moment of
 * queueing, and a player can then sit there for minutes watching a waiting
 * timer tick beside a count from when they clicked.
 *
 * Cheap by construction — the queue holds at most one waiting player, and this
 * only reaches sockets belonging to this process.
 *
 * Never throws: it sits on the connect and disconnect paths, and a count that
 * fails to refresh must not cost either of them their real work.
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
 * Whether a queued player can still be paired with.
 *
 * Three ways an entry goes bad, and all three look identical in the hash:
 * the socket dropped without its cleanup running (a dyno restart), the player
 * joined a room some other way while queued (a second tab), or the entry is old
 * enough that neither answer can be trusted. A player record existing IS being
 * in a room — that is what `addPlayerToRoom` creates.
 */
const isPairable = async (entry, now) => {
    if (now - entry.queuedAt > MATCH_ENTRY_STALE_MS) return false;
    if (!isConnected(entry.socketId)) return false;
    return !(await playerRepo.exists(entry.socketId));
};

/**
 * Takes the longest-waiting pairable player, pruning everyone it rejects on the
 * way past. Runs under the match lock — see `findMatch`.
 */
const takePartner = async (socketId) => {
    const waiting = await matchRepo.listWaiting();
    const now = Date.now();

    for (const entry of waiting) {
        // Their own entry from an earlier click. Not stale, not theirs to prune
        // — the enqueue below overwrites it.
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
 * Builds the room and puts both players in it.
 *
 * The waiting player is host: they have been in the queue longer, and PVP's
 * host is whoever presses Start. Order matters — `socket.join` before
 * `addPlayerToRoom`, because the latter broadcasts to the room.
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

        // The dimensions travel for the same reason a manual join carries them: the
        // flag counter is client-side and has nothing else to size itself from.
        const joined = { room, mode: 'pvp', numRows: rows, numCols: cols, numMines: mines };
        io.to(hostSocket.id).emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, { ...joined, isHost: true });
        io.to(guestSocket.id).emit(SERVER_EVENTS.JOIN_ROOM_SUCCESS, { ...joined, isHost: false });

        // Read back from the records addPlayerToRoom just wrote, so the avatar
        // the opponent sees is the validated stored one, same as the join path.
        const hostAvatar = await playerRepo.getAvatar(hostSocket.id);
        const guestAvatar = await playerRepo.getAvatar(guestSocket.id);
        io.to(hostSocket.id).emit(SERVER_EVENTS.PVP_ROOM_READY, { opponentName: guestName, opponentAvatar: guestAvatar, isHost: true });
        io.to(guestSocket.id).emit(SERVER_EVENTS.PVP_ROOM_READY, { opponentName: host.name, opponentAvatar: hostAvatar, isHost: false });

        return room;
    } catch (error) {
        // A leftover player record reads as "in a room": it blocks the player's
        // own retry and makes the re-enqueued host unpairable.
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
        const displayName = normalizePlayerName(name);
        if (!isValidPlayerName(displayName)) {
            socket.emit(SERVER_EVENTS.MATCH_ERROR);
            return;
        }

        // Already in a room. Matchmaking is a landing-page action, and pairing
        // someone mid-game would move them out of the board they can see.
        if (await playerRepo.exists(socket.id)) {
            socket.emit(SERVER_EVENTS.MATCH_ERROR);
            return;
        }

        const sessionId = socket.handshake.auth?.sessionId;

        /*
         * "Is anyone waiting, and if so take them, otherwise wait" is ONE
         * decision. Unlocked, two players arriving together both read an empty
         * queue and both sit down in it, each waiting for the other — a
         * deadlock that resolves only when a third player shows up.
         *
         * Only the decision is held: building the room is several round trips
         * and the partner is already out of the queue by then, so nobody else
         * can reach them.
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
            // They dropped in the window between the liveness check and here.
            // Rare enough to just retry as a fresh search rather than loop.
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
            // The partner is out of the queue and has been told nothing, so put
            // them back rather than leaving them waiting on a room that never
            // got built.
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
 * Handles 'startPracticeRace' — "nobody is around, give me a board anyway".
 *
 * **A practice race is a co-op room with one player**, which is a thing the app
 * has always supported. Board generation, cell actions, the clock, the win
 * check and best-time recording therefore all work untouched, and there is no
 * practice mode for the server to know about.
 *
 * The opponent is drawn entirely by the CLIENT, from a target time it reads out
 * of its own records. That is not a shortcut: in PVP the opponent is only ever
 * a percentage on a bar (`pvpOpponentProgress` carries nothing else), so a
 * target time renders identically to a live racer without anything having to
 * pretend a second player exists. Nothing here writes a fake result — the clear
 * is a real solo clear of a real no-guess board, and counts as exactly that.
 */
const startPracticeRace = async ({ socket, name }) => {
    try {
        const displayName = normalizePlayerName(name);
        if (!isValidPlayerName(displayName)) {
            socket.emit(SERVER_EVENTS.MATCH_ERROR);
            return;
        }

        if (await playerRepo.exists(socket.id)) {
            socket.emit(SERVER_EVENTS.MATCH_ERROR);
            return;
        }

        // Taking the practice board IS leaving the queue. Done before the room
        // is built, so a slow creation cannot leave them pairable meanwhile.
        await matchRepo.remove(socket.id);

        const room = await mintRoomCode('SOLO');
        const { rows, cols, mines } = DEFAULT_PRESET;

        await createRoom(room, rows, cols, mines, 'co-op');
        /*
         * Room CONFIGURATION, the same shape of thing as `mode` and `noGuess`:
         * it records how the room was opened and nothing else. The server still
         * has no target — no time, no opponent, no bar — and could not have one,
         * since the target comes out of the player's own browser records.
         *
         * Stored rather than merely announced because a reload has to find its
         * way back. A resume re-joins through the ordinary `joinRoom` handler,
         * which knows only what the room says; without this the board, clock and
         * score all came back and the opponent silently did not.
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
    // Emitted either way: the client is waiting to be let out of the dialog,
    // and a queue entry that outlived a failed delete is pruned on the way past
    // anyway (see isPairable).
    socket.emit(SERVER_EVENTS.MATCH_CANCELLED);
};

/**
 * Silent cleanup for a socket that is going away. No emit — there is nobody
 * left to tell. Never throws, so it can sit ahead of `removePlayer` on the
 * disconnect path without being able to cost it its cleanup.
 */
const leaveQueue = async (socket) => {
    try {
        await matchRepo.remove(socket.id);
    } catch (error) {
        console.error('Error removing from match queue:', error);
    }
};

module.exports = { findMatch, cancelMatch, startPracticeRace, leaveQueue, broadcastOnlineCount };
