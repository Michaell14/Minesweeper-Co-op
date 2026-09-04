/**
 * The friend graph. One row per pair, in the direction it was created (see the
 * migration), so every query looks BOTH ways and the repo decides what a row
 * means from where the asking user sits. Two graph rules live here, not in the
 * controller: caps (a friend list is a fan-out surface for presence and
 * invites) and blocks win in either direction. Both are check-then-write, so
 * every mutation runs inside `withPairLock`. Throws when Postgres is missing
 * or down; the controller owns the policy.
 */

const { pgPool, query } = require('../utils/initializePgClient');

/**
 * Both caps bound fan-out, not storage: 100 friends caps the presence scan and
 * the list join; 20 outstanding requests closes the one spam vector a
 * mutual-accept graph has.
 */
const MAX_FRIENDS = 100;
const MAX_OUTGOING_REQUESTS = 20;

const STATUS = Object.freeze({ pending: 'pending', accepted: 'accepted', blocked: 'blocked' });

/** The public view of somebody else. Never their email. */
const PROFILE_COLUMNS = 'u.id, u.display_name, u.avatar';

const rowToProfile = (row) => ({
    id: row.id,
    displayName: row.display_name,
    avatar: row.avatar,
});

/**
 * Reads take a `runner` (anything with `.query`): the pool by default, or the
 * transaction client a mutation holds so its checks and write see one snapshot.
 */
const pool = { query: (text, params) => query(text, params) };

/**
 * Serialises every mutation touching an unordered pair, in one transaction.
 * Caps and the block boundary are check-then-write, and row locks cannot close
 * that window (a cap counts OTHER rows; the block race is about a row that
 * does not exist yet), so the pair takes an advisory lock. Two locks, one per
 * account, in sorted id order so overlapping pairs queue instead of
 * deadlocking; locking both ends is what makes a per-user cap safe.
 */
const withPairLock = async (a, b, fn) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');

    const [first, second] = a < b ? [a, b] : [b, a];
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        // One statement each: lock order inside a single target list is not guaranteed.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [first]);
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [second]);
        const outcome = await fn(client);
        await client.query('COMMIT');
        return outcome;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

/**
 * The single row between two accounts, whichever way round. `direction` is the
 * caller's orientation ('outgoing' means `me` requested), so call sites never
 * re-derive it.
 */
const findEdge = async (me, them, runner = pool) => {
    const result = await runner.query(
        `SELECT id, requester_id, addressee_id, status
         FROM friendships
         WHERE (requester_id = $1 AND addressee_id = $2)
            OR (requester_id = $2 AND addressee_id = $1)`,
        [me, them],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
        id: row.id,
        status: row.status,
        requesterId: row.requester_id,
        addresseeId: row.addressee_id,
        direction: row.requester_id === me ? 'outgoing' : 'incoming',
    };
};

/**
 * Batched `findEdge`, keyed by the other account's id. One statement because
 * the caller walks a room, and co-op rooms have no size limit.
 */
const findEdges = async (me, others) => {
    if (!Array.isArray(others) || others.length === 0) return new Map();

    const result = await query(
        `SELECT id, requester_id, addressee_id, status
         FROM friendships
         WHERE (requester_id = $1 AND addressee_id = ANY($2))
            OR (addressee_id = $1 AND requester_id = ANY($2))`,
        [me, others],
    );

    const byUser = new Map();
    for (const row of result.rows) {
        const them = row.requester_id === me ? row.addressee_id : row.requester_id;
        byUser.set(them, {
            id: row.id,
            status: row.status,
            requesterId: row.requester_id,
            addresseeId: row.addressee_id,
            direction: row.requester_id === me ? 'outgoing' : 'incoming',
        });
    }
    return byUser;
};

/**
 * Everything one account's graph holds, in one round trip, as four lists
 * because they are four different things on screen. Blocks are MINE only: one
 * placed on me stays invisible, and mine come back because a block is the one
 * edge I cannot lift without seeing it.
 */
const listGraph = async (me) => {
    const result = await query(
        `SELECT f.id, f.status, f.requester_id, f.created_at, ${PROFILE_COLUMNS}
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
         WHERE (f.requester_id = $1 OR f.addressee_id = $1)
           -- A block placed ON me stays invisible; one I placed comes back so
           -- I can lift it.
           AND (f.status <> '${STATUS.blocked}' OR f.requester_id = $1)
         ORDER BY f.created_at ASC`,
        [me],
    );

    const friends = [];
    const incoming = [];
    const outgoing = [];
    const blocked = [];
    for (const row of result.rows) {
        const entry = rowToProfile(row);
        if (row.status === STATUS.blocked) blocked.push(entry);
        else if (row.status === STATUS.accepted) friends.push(entry);
        else if (row.requester_id === me) outgoing.push(entry);
        else incoming.push(entry);
    }
    return { friends, incoming, outgoing, blocked };
};

/** How many accepted friendships an account holds, in either direction. */
const countFriends = async (userId, runner = pool) => {
    const result = await runner.query(
        `SELECT count(*)::int AS count FROM friendships
         WHERE status = $2 AND (requester_id = $1 OR addressee_id = $1)`,
        [userId, STATUS.accepted],
    );
    return result.rows[0].count;
};

const countOutgoingRequests = async (userId, runner = pool) => {
    const result = await runner.query(
        'SELECT count(*)::int AS count FROM friendships WHERE requester_id = $1 AND status = $2',
        [userId, STATUS.pending],
    );
    return result.rows[0].count;
};

/**
 * Ask somebody to be friends, or accept their standing ask. Returns one of
 * 'requested', 'accepted' (they had already asked), 'already-friends',
 * 'already-requested', 'blocked', 'blocked-by-me', 'cap-reached',
 * 'their-cap-reached', 'request-cap-reached'. A reciprocal request accepts
 * the existing row rather than inserting one facing the other way, which
 * would violate the pair key. A block placed on me answers 'blocked' and
 * tells the blocked party nothing more.
 */
const requestFriend = async (me, them) => {
    if (me === them) return 'self';
    return withPairLock(me, them, (client) => requestUnderLock(client, me, them));
};

/** The body of `requestFriend`, on the client holding the pair lock. */
const requestUnderLock = async (client, me, them) => {
    const edge = await findEdge(me, them, client);
    if (edge) {
        // A block placed on ME answers like a code nobody holds; one I placed
        // is named, or I could never work out why a friend's code stopped working.
        if (edge.status === STATUS.blocked) {
            return edge.direction === 'outgoing' ? 'blocked-by-me' : 'blocked';
        }
        if (edge.status === STATUS.accepted) return 'already-friends';
        if (edge.direction === 'outgoing') return 'already-requested';
        // They asked first, so this is an acceptance. Same lock and transaction:
        // `acceptRequest` would re-take the pair lock on another connection and wait forever.
        return acceptUnderLock(client, me, them);
    }

    // Both sides' caps: a request that could never be accepted is better refused than left pending.
    if ((await countFriends(me, client)) >= MAX_FRIENDS) return 'cap-reached';
    if ((await countFriends(them, client)) >= MAX_FRIENDS) return 'their-cap-reached';
    if ((await countOutgoingRequests(me, client)) >= MAX_OUTGOING_REQUESTS) return 'request-cap-reached';

    await client.query(
        `INSERT INTO friendships (requester_id, addressee_id, status)
         VALUES ($1, $2, $3)`,
        [me, them, STATUS.pending],
    );
    return 'requested';
};

/**
 * Accept a request addressed to me. Returns 'accepted', 'cap-reached' (mine),
 * 'their-cap-reached' or 'no-request'. BOTH caps are re-checked inside the
 * statement: either account can fill up while the request sits pending. The
 * subselect only bounds accepts in its snapshot; the pair lock makes two
 * simultaneous accepts see each other. Only a PENDING row addressed to me
 * qualifies, which also stops a requester accepting their own request.
 */
const acceptRequest = async (me, them) =>
    withPairLock(me, them, (client) => acceptUnderLock(client, me, them));

/** The body of `acceptRequest`, on the client holding the pair lock. */
const acceptUnderLock = async (client, me, them) => {
    const result = await client.query(
        `UPDATE friendships
         SET status = $3, responded_at = now()
         WHERE requester_id = $2 AND addressee_id = $1 AND status = $4
           AND (SELECT count(*) FROM friendships
                WHERE status = $3 AND (requester_id = $1 OR addressee_id = $1)) < $5
           AND (SELECT count(*) FROM friendships
                WHERE status = $3 AND (requester_id = $2 OR addressee_id = $2)) < $5
         RETURNING id`,
        [me, them, STATUS.accepted, STATUS.pending, MAX_FRIENDS],
    );
    if (result.rows.length > 0) return 'accepted';

    // Which cap stopped it, read on the same locked transaction.
    if ((await countFriends(me, client)) >= MAX_FRIENDS) return 'cap-reached';
    if ((await countFriends(them, client)) >= MAX_FRIENDS) return 'their-cap-reached';
    return 'no-request';
};

/** Turn down a request addressed to me. Idempotent: nothing to decline is fine. */
const declineRequest = async (me, them) => {
    const result = await query(
        `DELETE FROM friendships
         WHERE requester_id = $2 AND addressee_id = $1 AND status = $3`,
        [me, them, STATUS.pending],
    );
    return result.rowCount > 0;
};

/**
 * Unfriend, cancel a request, or unblock: from the acting user's side it is
 * one operation. A block is only removable by the account that placed it.
 */
const removeEdge = async (me, them) => {
    const result = await query(
        `DELETE FROM friendships
         WHERE (requester_id = $1 AND addressee_id = $2)
            OR (requester_id = $2 AND addressee_id = $1 AND status <> $3)`,
        [me, them, STATUS.blocked],
    );
    return result.rowCount > 0;
};

/**
 * Block somebody, whatever the pair held before. DELETE then INSERT under the
 * pair lock: an accepted row cannot be left behind, the pair key forbids
 * inserting alongside, and the lock is what lets the block WIN a race with an
 * in-flight request. Stored on the BLOCKER's row, which `removeEdge` reads.
 */
const blockUser = async (me, them) => {
    if (me === them) return false;

    return withPairLock(me, them, async (client) => {
        await client.query(
            `DELETE FROM friendships
             WHERE (requester_id = $1 AND addressee_id = $2)
                OR (requester_id = $2 AND addressee_id = $1)`,
            [me, them],
        );
        await client.query(
            `INSERT INTO friendships (requester_id, addressee_id, status, responded_at)
             VALUES ($1, $2, $3, now())`,
            [me, them, STATUS.blocked],
        );
        return true;
    });
};

/** Whether these two are friends — what invites and presence gate on. */
const areFriends = async (me, them) => {
    const result = await query(
        `SELECT 1 FROM friendships
         WHERE status = $3
           AND ((requester_id = $1 AND addressee_id = $2)
             OR (requester_id = $2 AND addressee_id = $1))`,
        [me, them, STATUS.accepted],
    );
    return result.rows.length > 0;
};

/** Every account this one is accepted friends with. Bounded by MAX_FRIENDS. */
const listFriendIds = async (userId) => {
    const result = await query(
        `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS friend_id
         FROM friendships
         WHERE status = $2 AND (requester_id = $1 OR addressee_id = $1)`,
        [userId, STATUS.accepted],
    );
    return result.rows.map((row) => row.friend_id);
};

module.exports = {
    MAX_FRIENDS,
    MAX_OUTGOING_REQUESTS,
    STATUS,
    findEdge,
    findEdges,
    listGraph,
    countFriends,
    countOutgoingRequests,
    requestFriend,
    acceptRequest,
    declineRequest,
    removeEdge,
    blockUser,
    areFriends,
    listFriendIds,
};
