/**
 * "Come play with me" — the one message this protocol lets an account send to
 * another account rather than to a room.
 *
 * Every guard here exists because of that. An invite arrives unbidden on
 * somebody else's screen, so it has to be provably wanted: only from an
 * ACCEPTED friend (a mutual graph is the whole anti-spam design), only into a
 * room the sender is actually in, only into one with space, and not again for
 * a minute.
 *
 * Best-effort like every other social path: a Postgres outage means invites
 * quietly do not send, never that a game stalls.
 */

const { io } = require('../utils/initializeClient');
const { isDbEnabled } = require('../utils/initializePgClient');
const roomRepo = require('../data/roomRepo');
const friendsRepo = require('../data/friendsRepo');
const { emitToUser, isOnline } = require('../utils/presence');
const { isValidRoomCode, isValidUserId, isPlayerInRoom } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * One invite per pair per minute.
 *
 * Per PAIR rather than per sender: the thing being protected is one person's
 * attention, and a sender with twenty friends should still be able to invite
 * all of them. Long enough that a second invite reads as a follow-up rather
 * than as a repeat of the first.
 */
const INVITE_COOLDOWN_MS = 60_000;

/**
 * In memory, not Redis: a cooldown that resets when the server restarts costs
 * one extra invite, which is not worth a round trip on a path that already
 * makes two. Pruned lazily on write — an unbounded Map of pairs is a leak that
 * only shows up under the traffic this is meant to survive.
 */
const lastInviteAt = new Map();
const MAX_TRACKED_PAIRS = 10_000;

const pairKey = (from, to) => `${from}:${to}`;

const onCooldown = (from, to, now) => {
    const last = lastInviteAt.get(pairKey(from, to));
    return last !== undefined && now - last < INVITE_COOLDOWN_MS;
};

const markInvited = (from, to, now) => {
    if (lastInviteAt.size >= MAX_TRACKED_PAIRS) {
        for (const [key, at] of lastInviteAt) {
            if (now - at >= INVITE_COOLDOWN_MS) lastInviteAt.delete(key);
        }
        // Still full of live entries: drop the oldest rather than grow.
        if (lastInviteAt.size >= MAX_TRACKED_PAIRS) {
            lastInviteAt.delete(lastInviteAt.keys().next().value);
        }
    }
    lastInviteAt.set(pairKey(from, to), now);
};

/**
 * Takes the pair's one slot for this minute, or returns null if it is taken.
 *
 * Taken BEFORE the awaited lookups rather than after them: two invites for one
 * pair arriving together would otherwise both read an empty cooldown, yield at
 * the first await, and both land. Returns the undo, called on every refusal so
 * a rejected invite does not spend the minute a real one is owed.
 */
const claimInvite = (from, to, now) => {
    if (onCooldown(from, to, now)) return null;

    const key = pairKey(from, to);
    const previous = lastInviteAt.get(key);
    markInvited(from, to, now);

    return () => {
        // Only if it is still ours: a later invite that beat us to the send
        // owns the slot now, and handing back a stale timestamp would reopen
        // the window it is holding.
        if (lastInviteAt.get(key) !== now) return;
        if (previous === undefined) lastInviteAt.delete(key);
        else lastInviteAt.set(key, previous);
    };
};

/** Test seam: the Map would otherwise leak state across cases. */
const clearInviteCooldowns = () => lastInviteAt.clear();

/**
 * Whether one more player fits.
 *
 * PVP is a duel, so its room is full at two. Co-op has no size limit by design
 * — the only thing an invite must not do is push a race to three.
 */
const hasSpace = (roomState) => {
    if (!roomState) return false;
    let players = [];
    try {
        players = JSON.parse(roomState.players || '[]');
    } catch {
        return false;
    }
    return roomState.mode === 'pvp' ? players.length < 2 : true;
};

/** The payload every guard agreed to, or null if any of them refused. */
const buildInvite = async (socket, me, friendId, room) => {
    // Offline first: it is the cheapest check and the most common refusal.
    if (!isOnline(friendId)) return null;
    if (!(await friendsRepo.areFriends(me.id, friendId))) return null;

    // The room has to be one the SENDER is in. Without this, an account could
    // send a friend into any room code it can name — including one it has
    // never been in, which is a way to make somebody else's game somebody
    // else's problem.
    const roomState = await roomRepo.getState(room);
    if (!roomState || !isPlayerInRoom(roomState, socket.id)) return null;
    if (!hasSpace(roomState)) return null;

    return {
        fromId: me.id,
        fromName: me.displayName,
        fromAvatar: me.avatar ?? null,
        room,
        mode: roomState.mode,
    };
};

/**
 * Sends the invite, or silently does not.
 *
 * SILENT on every refusal, the same stance as the emote and ping handlers: the
 * failures here are "you are not their friend", "they blocked you" and "they
 * are not online", and answering any of them tells the sender something about
 * somebody who did not choose to tell them.
 */
const inviteFriend = async (socket, { friendId, room }) => {
    const me = socket.data?.user;
    if (!me || !isDbEnabled()) return;
    if (!isValidUserId(friendId) || !isValidRoomCode(room)) return;
    if (friendId === me.id) return;

    const release = claimInvite(me.id, friendId, Date.now());
    if (!release) return;

    try {
        const invite = await buildInvite(socket, me, friendId, room);
        if (!invite) return release();

        emitToUser(friendId, SERVER_EVENTS.FRIEND_INVITE, invite);
    } catch (error) {
        release();
        console.error('Error inviting a friend:', error.message);
    }
};

module.exports = { inviteFriend, clearInviteCooldowns, INVITE_COOLDOWN_MS };
