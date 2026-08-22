/**
 * The friend graph. One row per pair, holding the direction it was created in
 * (see the migration), so every query here looks BOTH ways and the repo — not
 * the caller — decides what a row means from where the asking user sits in it.
 *
 * Two rules are enforced here rather than in the controller, because they are
 * properties of the graph rather than of a request:
 *
 *   - **Caps.** A friend list is a fan-out surface: presence pushes and invites
 *     both walk it, so an unbounded one is an unbounded per-event cost.
 *   - **Blocks win.** A blocked pair cannot request, accept or be listed, in
 *     either direction, however the call arrives.
 *
 * Both are check-then-write, so every mutation runs inside `withPairLock` —
 * see there for why a row lock cannot stand in for it.
 *
 * Throws when Postgres is missing or down; the controller owns the policy.
 */

const { pgPool, query } = require('../utils/initializePgClient');

/**
 * Both caps are about fan-out, not storage.
 *
 * 100 friends is the ceiling on the presence scan and the friend-list join;
 * 20 outstanding requests is what stops one account papering every inbox on
 * the server, which is the only spam vector a mutual-accept graph has.
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
 * Every read below takes a `runner` — anything with `.query`. The default is
 * the pool; a mutation passes the client of the transaction it holds, so its
 * checks and its write see one snapshot instead of two.
 */
const pool = { query: (text, params) => query(text, params) };

/**
 * Serialise every mutation touching an unordered pair, in one transaction.
 *
 * The caps and the block boundary are all check-then-write: a count or an edge
 * is read, and the statement acting on it runs later. Row locks cannot close
 * that window — a cap counts rows other than the one being written, and the
 * block race is about a row that does not exist yet — so the pair takes an
 * ADVISORY lock instead. Without it: two requests from one account both read
 * 19 outgoing and both insert, two accepts both read 99 friends and both
 * commit, and a request that read no edge inserts `A -> B` pending after `B`
 * blocked `A`, leaving both orientations on the table and a block that a later
 * accept walks straight through.
 *
 * TWO locks, one per account, taken in sorted id order so overlapping pairs
 * queue instead of deadlocking. Locking both ends is what makes a per-user
 * aggregate safe: every accept that could push MY count over the cap holds my
 * lock, whoever is at the other end of it. `hashtextextended` collisions only
 * ever make two unrelated pairs wait for each other.
 */
const withPairLock = async (a, b, fn) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');

    const [first, second] = a < b ? [a, b] : [b, a];
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        // One statement each: the order of two lock calls inside a single
        // target list is not guaranteed, and the order is the whole point.
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
 * The single row between two accounts, whichever way round it was created.
 *
 * `direction` is the caller's own orientation — 'outgoing' means `me` is the
 * requester — because every decision above this line is about what the ASKING
 * user may do, and re-deriving that at each call site is where the mistakes
 * would be.
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
 * Everything one account's graph holds, in one round trip.
 *
 * Four lists rather than one with a status field, because they are four
 * different things on screen: people you can play with, requests waiting on
 * you, requests waiting on somebody else, and people you have blocked.
 *
 * The blocks are MINE ONLY — never one placed on me, which is the whole point
 * of a block being invisible from the other side. The PRD had them not
 * returned at all, on the grounds that a block is a thing you do rather than a
 * list you maintain; that was wrong in one direction. Blocking is the only
 * edge a player cannot undo without seeing it, so leaving it off the list
 * makes it a one-way door: their friend's code simply stops working, with
 * nothing on screen to explain it or lift it.
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
 * Ask somebody to be friends, or accept their standing ask.
 *
 * Returns one of: 'requested', 'accepted' (they had already asked you),
 * 'already-friends', 'already-requested', 'blocked', 'blocked-by-me',
 * 'cap-reached', 'their-cap-reached', 'request-cap-reached'.
 *
 * The reciprocal case is the one worth spelling out: if B already has a
 * pending request to A and A now "requests" B, the two of them have agreed,
 * and the honest answer is to accept the existing row rather than insert a
 * second one facing the other way. Without that, a unique-violation on the
 * pair key would surface as a server error for two people doing exactly what
 * the feature asks of them.
 *
 * A block answers 'blocked' from EITHER side, and says nothing about which:
 * "your request was not delivered" is all the blocked party learns, because
 * the alternative tells them they were blocked and by whom.
 */
const requestFriend = async (me, them) => {
    if (me === them) return 'self';
    return withPairLock(me, them, (client) => requestUnderLock(client, me, them));
};

/** The body of `requestFriend`, on the client holding the pair lock. */
const requestUnderLock = async (client, me, them) => {
    const edge = await findEdge(me, them, client);
    if (edge) {
        // Told apart on purpose. A block placed on ME answers like a code
        // nobody holds, so the blocked party learns nothing; a block I placed
        // is my own doing, and saying so is the only way I would ever work out
        // why a friend's code stopped working.
        if (edge.status === STATUS.blocked) {
            return edge.direction === 'outgoing' ? 'blocked-by-me' : 'blocked';
        }
        if (edge.status === STATUS.accepted) return 'already-friends';
        if (edge.direction === 'outgoing') return 'already-requested';
        // They asked first: this is an acceptance, not a new request. Same
        // lock, same transaction — never `acceptRequest`, which would take the
        // pair lock a second time on a different connection and wait on this
        // one forever.
        return acceptUnderLock(client, me, them);
    }

    // Caps checked on BOTH sides: a request that could never be accepted
    // because the other account is full is better refused now than left
    // pending forever, and their inbox is not the place to store my overflow.
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
 * Accept a request addressed to me.
 *
 * Returns 'accepted', 'cap-reached' (mine), 'their-cap-reached', or
 * 'no-request'.
 *
 * The cap is re-checked inside the same statement rather than before it: an
 * account that filled up while a request sat pending must not be able to
 * exceed the cap by accepting the backlog. That subselect reads the
 * transaction's snapshot, so it only bounds the accepts it can SEE — the pair
 * lock is what makes two simultaneous accepts into my inbox see each other.
 *
 * BOTH ends are counted. `requestFriend` checks both too, but that check is
 * only true of the moment the request was made: the requester can fill up
 * while their ask sits in my inbox, and accepting then would put THEM at 101
 * — a cap breach that neither of us asked for and only they can see.
 *
 * Only a PENDING row addressed to me can be accepted, which is also what stops
 * a requester accepting their own request.
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

    // Which cap stopped it, so the answer can say. Both reads are on the same
    // locked transaction as the update that just declined to fire.
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
 * Unfriend, cancel a request, or unblock — whatever the pair currently holds,
 * from my side.
 *
 * One operation rather than three, because from the acting user's point of
 * view it is one: "I no longer want this edge". A block is only removable by
 * the account that placed it, which is the one asymmetry.
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
 * Block somebody, whatever the pair held before.
 *
 * DELETE then INSERT, under the pair lock: leaving an accepted row behind would
 * keep two people listed as friends while one had blocked the other, and the
 * pair key means the block cannot simply be inserted alongside. The lock is
 * what makes the block WIN a race with an in-flight request — otherwise a
 * request that had already read "no edge" inserts its pending row afterwards.
 * The block is stored on the BLOCKER's row, which is what `removeEdge` reads to
 * decide that only they may lift it.
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
