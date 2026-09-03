/**
 * "Come play with me": the one message an account sends to another account
 * rather than to a room. It arrives unbidden, so every guard here makes it
 * provably wanted: only from an ACCEPTED friend, only into a room the sender
 * is in, only into one with space, and not again for a minute. Best-effort:
 * a Postgres outage means invites quietly do not send.
 */

const { io } = require('../utils/initializeClient');
const { isDbEnabled } = require('../utils/initializePgClient');
const roomRepo = require('../data/roomRepo');
const friendsRepo = require('../data/friendsRepo');
const { emitToUser, isOnline } = require('../utils/presence');
const { isValidRoomCode, isValidUserId, isPlayerInRoom } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * One invite per pair per minute. Per PAIR, not per sender: the thing
 * protected is one person's attention.
 */
const INVITE_COOLDOWN_MS = 60_000;

/**
 * In memory, not Redis: a cooldown lost on restart costs one extra invite.
 * Pruned lazily on write so the Map of pairs cannot leak.
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
 * Takes the pair's slot for this minute, or returns null. Claimed BEFORE the
 * awaited lookups, or two invites arriving together would both land. Returns
 * the undo, called on every refusal so a rejected invite does not spend the minute.
 */
const claimInvite = (from, to, now) => {
    if (onCooldown(from, to, now)) return null;

    const key = pairKey(from, to);
    const previous = lastInviteAt.get(key);
    markInvited(from, to, now);

    return () => {
        // Only if still ours: a later invite that beat us to the send owns the slot now.
        if (lastInviteAt.get(key) !== now) return;
        if (previous === undefined) lastInviteAt.delete(key);
        else lastInviteAt.set(key, previous);
    };
};

/** Test seam: the Map would otherwise leak state across cases. */
const clearInviteCooldowns = () => lastInviteAt.clear();

/** Whether one more player fits. PVP is full at two; co-op has no limit. */
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

    // The room has to be one the SENDER is in, or an account could send a
    // friend into any room code it can name.
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
 * Sends the invite, or silently does not. SILENT on every refusal, like the
 * emote and ping handlers: "not their friend", "blocked" and "not online" all
 * tell the sender something about somebody who did not choose to tell them.
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
