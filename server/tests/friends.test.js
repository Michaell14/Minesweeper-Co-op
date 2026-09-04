/**
 * The friend graph: the repo's semantics for a pair of accounts, and what the
 * routes say about it. Pins the invisible-when-wrong cases: a reciprocal
 * request becoming a friendship, caps surviving a pending backlog, and a block
 * answering exactly like an unknown code.
 *
 * Postgres is mocked (themes.test.js sets the pattern). Reads run on the pool
 * (`mockQuery`); mutations run on a transaction client (`mockClientQuery`)
 * behind BEGIN, two advisory locks and COMMIT. That plumbing answers itself and
 * `statements()` filters it out.
 */

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();

jest.mock('../utils/initializePgClient', () => ({
    pgPool: { connect: (...a) => mockConnect(...a) },
    isDbEnabled: () => true,
    query: (...args) => mockQuery(...args),
}));

jest.mock('../controllers/profileController', () => ({ requireUser: jest.fn() }));

const friendsRepo = require('../data/friendsRepo');
const userRepo = require('../data/userRepo');
const { registerFriendsRoutes } = require('../controllers/friendsController');

const ME = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const THEM = '9c858901-8a57-4791-81fe-4c455b099bc9';

/** A friendships row as the driver hands it back. */
const edgeRow = (requesterId, addresseeId, status) => ({
    id: 7,
    requester_id: requesterId,
    addressee_id: addresseeId,
    status,
});

const PLUMBING = /^(BEGIN|COMMIT|ROLLBACK|SELECT pg_advisory_xact_lock)/;

/** What the transaction ran, minus BEGIN / the locks / COMMIT. */
const statements = () => mockClientQuery.mock.calls.filter(([sql]) => !PLUMBING.test(sql.trim()));

/** The advisory-lock arguments, in the order the transaction took them. */
const lockOrder = () => mockClientQuery.mock.calls
    .filter(([sql]) => /pg_advisory_xact_lock/.test(sql))
    .map(([, params]) => params[0]);

/** Queue answers for the statements; the plumbing answers itself. */
let queued = [];
const answers = (...rows) => { queued = [...rows]; };

beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockRelease.mockReset();
    mockConnect.mockReset();
    queued = [];
    mockConnect.mockImplementation(async () => ({
        query: (...a) => mockClientQuery(...a),
        release: mockRelease,
    }));
    mockClientQuery.mockImplementation(async (sql) => {
        if (PLUMBING.test(sql.trim())) return { rows: [] };
        return queued.shift() ?? { rows: [], rowCount: 0 };
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('requestFriend', () => {
    test('inserts a pending row when the pair has no history', async () => {
        answers(
            { rows: [] },                   // findEdge
            { rows: [{ count: 4 }] },       // my friends
            { rows: [{ count: 9 }] },       // their friends
            { rows: [{ count: 2 }] },       // my outgoing
            { rows: [] },                   // insert
        );

        expect(await friendsRepo.requestFriend(ME, THEM)).toBe('requested');
        const [sql, params] = statements()[4];
        expect(sql).toMatch(/INSERT INTO friendships/);
        expect(params).toEqual([ME, THEM, 'pending']);
    });

    /*
     * Two requests from one account reading the same outgoing count both
     * insert, ending past the cap. Every check must sit behind the lock.
     */
    test('reads its caps and writes its row in ONE locked transaction', async () => {
        answers(
            { rows: [] },
            { rows: [{ count: 4 }] },
            { rows: [{ count: 9 }] },
            { rows: [{ count: 2 }] },
            { rows: [] },
        );
        await friendsRepo.requestFriend(ME, THEM);

        expect(mockQuery).not.toHaveBeenCalled();          // nothing on the pool
        expect(mockConnect).toHaveBeenCalledTimes(1);      // nothing on a second connection
        const sql = mockClientQuery.mock.calls.map(([text]) => text.trim().split('\n')[0]);
        expect(sql[0]).toBe('BEGIN');
        expect(sql[sql.length - 1]).toBe('COMMIT');
        expect(mockRelease).toHaveBeenCalled();
    });

    /* Sorted, not call order: a total order over the ids is what prevents deadlock. */
    test('locks both accounts, in sorted id order', async () => {
        answers({ rows: [] }, { rows: [{ count: 0 }] }, { rows: [{ count: 0 }] }, { rows: [{ count: 0 }] }, { rows: [] });
        await friendsRepo.requestFriend(THEM, ME);   // named the other way round
        expect(lockOrder()).toEqual([ME, THEM].sort());
    });

    /* They asked first; a mirror insert would violate the pair key. */
    test('accepts their standing request instead of inserting a mirror row', async () => {
        answers(
            { rows: [edgeRow(THEM, ME, 'pending')] },   // findEdge
            { rows: [{ id: 7 }] },                      // accept UPDATE
        );

        expect(await friendsRepo.requestFriend(ME, THEM)).toBe('accepted');
        expect(statements()[1][0]).toMatch(/UPDATE friendships/);
        expect(statements().some(([sql]) => /INSERT INTO friendships/.test(sql))).toBe(false);
        // On the lock it already holds; the public acceptRequest would deadlock.
        expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['already-friends', 'accepted', ME, THEM],
        ['already-requested', 'pending', ME, THEM],
        // A block placed ON me must look like nothing; one I placed is worth naming.
        ['blocked-by-me', 'blocked', ME, THEM],
        ['blocked', 'blocked', THEM, ME],
    ])('answers %s for an existing %s row', async (expected, status, requester, addressee) => {
        answers({ rows: [edgeRow(requester, addressee, status)] });
        expect(await friendsRepo.requestFriend(ME, THEM)).toBe(expected);
    });

    test('refuses to befriend yourself', async () => {
        expect(await friendsRepo.requestFriend(ME, ME)).toBe('self');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    describe('caps', () => {
        test('refuses when my list is full', async () => {
            answers({ rows: [] }, { rows: [{ count: friendsRepo.MAX_FRIENDS }] });
            expect(await friendsRepo.requestFriend(ME, THEM)).toBe('cap-reached');
        });

        /* A request that could never be accepted is refused now, not left pending. */
        test('refuses when their list is full', async () => {
            answers({ rows: [] }, { rows: [{ count: 1 }] }, { rows: [{ count: friendsRepo.MAX_FRIENDS }] });
            expect(await friendsRepo.requestFriend(ME, THEM)).toBe('their-cap-reached');
        });

        // The only spam vector a mutual-accept graph has: papering inboxes.
        test('refuses past the outstanding-request cap', async () => {
            answers(
                { rows: [] },
                { rows: [{ count: 1 }] },
                { rows: [{ count: 1 }] },
                { rows: [{ count: friendsRepo.MAX_OUTGOING_REQUESTS }] },
            );
            expect(await friendsRepo.requestFriend(ME, THEM)).toBe('request-cap-reached');
            expect(statements().some(([sql]) => /INSERT INTO friendships/.test(sql))).toBe(false);
        });
    });
});

describe('acceptRequest', () => {
    test('only flips a PENDING row addressed to me', async () => {
        answers({ rows: [{ id: 7 }] });
        expect(await friendsRepo.acceptRequest(ME, THEM)).toBe('accepted');

        const [sql, params] = statements()[0];
        // requester = them, addressee = me: a requester cannot accept their own.
        expect(params.slice(0, 2)).toEqual([ME, THEM]);
        expect(sql).toMatch(/requester_id = \$2 AND addressee_id = \$1/);
        expect(sql).toMatch(/status = \$4/);
    });

    /* The cap rides inside the update: accepting a backlog must not exceed it. */
    test('carries the cap in the same statement', async () => {
        answers({ rows: [{ id: 7 }] });
        await friendsRepo.acceptRequest(ME, THEM);
        const [sql, params] = statements()[0];
        expect(sql).toMatch(/SELECT count\(\*\) FROM friendships/);
        expect(params).toContain(friendsRepo.MAX_FRIENDS);
    });

    /*
     * The subselect reads its own snapshot, so two concurrent accepts at 99
     * landed on 101. Both take MY lock, so the second reads the first.
     */
    test('runs under a lock on the accepting account', async () => {
        answers({ rows: [{ id: 7 }] });
        await friendsRepo.acceptRequest(ME, THEM);
        expect(lockOrder()).toContain(ME);
        expect(lockOrder()).toEqual([ME, THEM].sort());
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('tells a full list from a missing request', async () => {
        answers(
            { rows: [] },                                       // no update
            { rows: [{ count: friendsRepo.MAX_FRIENDS }] },     // because I am full
        );
        expect(await friendsRepo.acceptRequest(ME, THEM)).toBe('cap-reached');

        answers({ rows: [] }, { rows: [{ count: 3 }] }, { rows: [{ count: 3 }] });
        expect(await friendsRepo.acceptRequest(ME, THEM)).toBe('no-request');
    });

    /* requestFriend's cap check is as of SEND time; the requester can fill up since. */
    test('refuses when the REQUESTER filled up while their ask sat pending', async () => {
        answers(
            { rows: [] },                                       // no update
            { rows: [{ count: 3 }] },                           // I have room
            { rows: [{ count: friendsRepo.MAX_FRIENDS }] },     // they do not
        );
        expect(await friendsRepo.acceptRequest(ME, THEM)).toBe('their-cap-reached');
    });

    test('carries BOTH participants\' caps in the update itself', async () => {
        answers({ rows: [{ id: 7 }] });
        await friendsRepo.acceptRequest(ME, THEM);
        const [sql] = statements()[0];
        expect(sql).toMatch(/requester_id = \$1 OR addressee_id = \$1\)\) < \$5/);   // mine
        expect(sql).toMatch(/requester_id = \$2 OR addressee_id = \$2\)\) < \$5/);   // theirs
    });
});

describe('removeEdge', () => {
    test('takes my own row whatever it holds, and theirs unless it is a block', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        await friendsRepo.removeEdge(ME, THEM);

        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toMatch(/requester_id = \$1 AND addressee_id = \$2/);
        // Their block is theirs to lift: unfriending must not clear it.
        expect(sql).toMatch(/requester_id = \$2 AND addressee_id = \$1 AND status <> \$3/);
        expect(params).toEqual([ME, THEM, 'blocked']);
    });
});

describe('blockUser', () => {
    /* DELETE then INSERT in one transaction: the pair key forbids a block beside an accepted row. */
    test('clears whatever the pair held, then stores the block on my row', async () => {
        expect(await friendsRepo.blockUser(ME, THEM)).toBe(true);

        const written = statements();
        expect(written[0][0]).toMatch(/DELETE FROM friendships/);
        expect(written[1][0]).toMatch(/INSERT INTO friendships/);
        expect(written[1][1]).toEqual([ME, THEM, 'blocked']);

        const all = mockClientQuery.mock.calls.map(([sql]) => sql.trim().split('\n')[0]);
        expect(all[0]).toBe('BEGIN');
        expect(all[all.length - 1]).toBe('COMMIT');
        expect(mockRelease).toHaveBeenCalled();
    });

    /*
     * A block must win a race with a request that already read "no edge",
     * which it can only do by queueing behind the same pair lock.
     */
    test('takes the same pair lock a request does', async () => {
        await friendsRepo.blockUser(THEM, ME);
        expect(lockOrder()).toEqual([ME, THEM].sort());
    });

    test('rolls back and releases the client when a statement throws', async () => {
        // ROLLBACK must resolve, not be the thing that throws while handling a throw.
        mockClientQuery.mockImplementation(async (sql) => {
            if (/DELETE FROM friendships/.test(sql)) throw new Error('boom');
            return { rows: [] };
        });
        await expect(friendsRepo.blockUser(ME, THEM)).rejects.toThrow('boom');
        expect(mockClientQuery.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
        expect(mockRelease).toHaveBeenCalled();
    });

    test('refuses to block yourself, without touching the database', async () => {
        expect(await friendsRepo.blockUser(ME, ME)).toBe(false);
        expect(mockConnect).not.toHaveBeenCalled();
    });
});

describe('listGraph', () => {
    test('splits one query into friends, incoming and outgoing', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 1, status: 'accepted', requester_id: ME, display_name: 'Pat', avatar: 'fox' },
                { id: 2, status: 'pending', requester_id: THEM, display_name: 'Sam', avatar: 'frog' },
                { id: 3, status: 'pending', requester_id: ME, display_name: 'Kim', avatar: null },
            ],
        });

        const graph = await friendsRepo.listGraph(ME);
        expect(graph.friends.map((f) => f.displayName)).toEqual(['Pat']);
        expect(graph.incoming.map((f) => f.displayName)).toEqual(['Sam']);   // they asked me
        expect(graph.outgoing.map((f) => f.displayName)).toEqual(['Kim']);   // I asked them
    });

    /* A block I placed is listed so I can lift it; one placed on me never is. */
    test('returns my own blocks and never one placed on me', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [
                { id: 1, status: 'blocked', requester_id: ME, display_name: 'Blocked By Me', avatar: null },
            ],
        });
        const graph = await friendsRepo.listGraph(ME);
        expect(graph.blocked.map((p) => p.displayName)).toEqual(['Blocked By Me']);
        expect(graph.friends).toEqual([]);

        expect(mockQuery.mock.calls[0][0]).toMatch(/status <> 'blocked' OR f\.requester_id = \$1/);
    });

    test('carries no email into the payload', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await friendsRepo.listGraph(ME);
        expect(mockQuery.mock.calls[0][0]).not.toMatch(/email/);
    });
});

describe('getOrCreateFriendCode', () => {
    test('returns the stored code without minting a new one', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ friend_code: 'ABC23XYZ' }] });
        expect(await userRepo.getOrCreateFriendCode(ME)).toBe('ABC23XYZ');
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    test('mints one on first ask and claims it only while the column is null', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ friend_code: null }] })
            .mockResolvedValueOnce({ rows: [{ friend_code: 'NEWCODE2' }] });

        expect(await userRepo.getOrCreateFriendCode(ME)).toBe('NEWCODE2');
        expect(mockQuery.mock.calls[1][0]).toMatch(/friend_code IS NULL/);
    });

    /* Two tabs at once: the loser's conditional update matches nothing and re-reads. */
    test('re-reads rather than overwriting when another request won the race', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ friend_code: null }] })
            .mockResolvedValueOnce({ rows: [] })                          // lost the claim
            .mockResolvedValueOnce({ rows: [{ friend_code: 'WINNER22' }] });
        expect(await userRepo.getOrCreateFriendCode(ME)).toBe('WINNER22');
    });

    test('retries a unique collision rather than failing the request', async () => {
        const collision = Object.assign(new Error('duplicate key'), { code: '23505' });
        mockQuery
            .mockResolvedValueOnce({ rows: [{ friend_code: null }] })
            .mockRejectedValueOnce(collision)
            .mockResolvedValueOnce({ rows: [{ friend_code: null }] })
            .mockResolvedValueOnce({ rows: [{ friend_code: 'SECOND22' }] });
        expect(await userRepo.getOrCreateFriendCode(ME)).toBe('SECOND22');
    });

    test('returns null for an account that is gone', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });
        expect(await userRepo.getOrCreateFriendCode(ME)).toBeNull();
    });
});

describe('the routes', () => {
    const routes = {};
    const fakeApp = {
        get: (path, _mw, handler) => { routes[`GET ${path}`] = handler; },
        post: (path, _mw, handler) => { routes[`POST ${path}`] = handler; },
        put: (path, _mw, handler) => { routes[`PUT ${path}`] = handler; },
        delete: (path, _mw, handler) => { routes[`DELETE ${path}`] = handler; },
    };
    registerFriendsRoutes(fakeApp);

    const makeRes = () => {
        const res = { statusCode: 200, body: undefined, ended: false };
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (payload) => { res.body = payload; return res; };
        res.end = () => { res.ended = true; return res; };
        return res;
    };
    const USER = { id: ME };

    test('GET returns the graph and the account\'s own code', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                            // listGraph
            .mockResolvedValueOnce({ rows: [{ friend_code: 'ABC23XYZ' }] }); // code
        const res = makeRes();
        await routes['GET /api/friends']({ user: USER }, res);
        expect(res.body).toEqual({ friends: [], incoming: [], outgoing: [], blocked: [], code: 'ABC23XYZ' });
    });

    test('POST accepts a code however it was typed', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: THEM }] });  // findByFriendCode
        answers(
            { rows: [] },               // findEdge
            { rows: [{ count: 0 }] },
            { rows: [{ count: 0 }] },
            { rows: [{ count: 0 }] },
            { rows: [] },               // insert
        );
        const res = makeRes();
        await routes['POST /api/friends']({ user: USER, body: { code: '  abc23xyz ' } }, res);
        expect(res.statusCode).toBe(201);
        expect(mockQuery.mock.calls[0][1]).toEqual(['ABC23XYZ']);
    });

    test.each([
        ['a malformed code', { code: 'nope' }],
        ['a missing body', undefined],
        ['a code with a symbol outside the alphabet', { code: 'ABC23XY!' }],
    ])('POST refuses %s before touching the database', async (_label, body) => {
        const res = makeRes();
        await routes['POST /api/friends']({ user: USER, body }, res);
        expect(res.statusCode).toBe(400);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    /* The privacy rule: a refusal that names a block tells the blocked party who blocked them. */
    test('POST answers a block exactly as it answers an unknown code', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });          // no such code
        const unknown = makeRes();
        await routes['POST /api/friends']({ user: USER, body: { code: 'ABC23XYZ' } }, unknown);

        mockQuery.mockReset();
        mockQuery.mockResolvedValueOnce({ rows: [{ id: THEM }] });      // found
        answers({ rows: [edgeRow(THEM, ME, 'blocked')] });              // they blocked me
        const blocked = makeRes();
        await routes['POST /api/friends']({ user: USER, body: { code: 'ABC23XYZ' } }, blocked);

        expect(blocked.statusCode).toBe(unknown.statusCode);
        expect(blocked.body).toEqual(unknown.body);
    });

    test('PUT accept flips the request', async () => {
        answers({ rows: [{ id: 7 }] });
        const res = makeRes();
        await routes['PUT /api/friends/:id']({ user: USER, params: { id: THEM }, body: { action: 'accept' } }, res);
        expect(res.statusCode).toBe(204);
    });

    test('PUT accept answers 404 when there is no request', async () => {
        answers({ rows: [] }, { rows: [{ count: 1 }] }, { rows: [{ count: 1 }] });
        const res = makeRes();
        await routes['PUT /api/friends/:id']({ user: USER, params: { id: THEM }, body: { action: 'accept' } }, res);
        expect(res.statusCode).toBe(404);
    });

    /* Either cap is a 409, worded from the same table as the request path. */
    test.each([
        ['my own list', [{ rows: [] }, { rows: [{ count: friendsRepo.MAX_FRIENDS }] }]],
        ['theirs', [{ rows: [] }, { rows: [{ count: 1 }] }, { rows: [{ count: friendsRepo.MAX_FRIENDS }] }]],
    ])('PUT accept answers 409 when %s is full', async (_label, queued) => {
        answers(...queued);
        const res = makeRes();
        await routes['PUT /api/friends/:id']({ user: USER, params: { id: THEM }, body: { action: 'accept' } }, res);
        expect(res.statusCode).toBe(409);
        expect(res.body.error).toEqual(expect.any(String));
    });

    test.each([
        ['an unknown action', { id: THEM }, { action: 'befriend-harder' }],
        ['a non-uuid id', { id: 'not-a-uuid' }, { action: 'accept' }],
        ['acting on yourself', { id: ME }, { action: 'block' }],
    ])('PUT refuses %s', async (_label, params, body) => {
        const res = makeRes();
        await routes['PUT /api/friends/:id']({ user: USER, params, body }, res);
        expect(res.statusCode).toBe(400);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('DELETE is idempotent, like account deletion', async () => {
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        const res = makeRes();
        await routes['DELETE /api/friends/:id']({ user: USER, params: { id: THEM } }, res);
        expect(res.statusCode).toBe(204);
    });

    test('a Postgres outage is a 503, not a crash', async () => {
        mockQuery.mockRejectedValue(new Error('connection terminated'));
        const res = makeRes();
        await routes['GET /api/friends']({ user: USER }, res);
        expect(res.statusCode).toBe(503);
    });
});
