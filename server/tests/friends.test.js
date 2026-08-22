/**
 * The friend graph: what the repo does with a pair of accounts, and what the
 * routes are willing to say about it.
 *
 * The semantics worth pinning down are the ones that are invisible when wrong:
 * a reciprocal request that should become a friendship rather than a duplicate
 * row, a cap that must survive a backlog of pending requests, and a block that
 * must answer exactly like a code nobody holds — because a refusal that names
 * a block tells the blocked party they were blocked, and by whom.
 *
 * Postgres is mocked, as it is for every other repo here (themes.test.js sets
 * the pattern): the SQL shape and the branch each outcome takes are what these
 * assert. The migrations themselves are not exercised — see the PRD.
 */

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();

jest.mock('../utils/initializePgClient', () => ({
    pgPool: { connect: async () => ({ query: (...a) => mockClientQuery(...a), release: mockRelease }) },
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

beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockRelease.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('requestFriend', () => {
    test('inserts a pending row when the pair has no history', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                    // findEdge
            .mockResolvedValueOnce({ rows: [{ count: 4 }] })        // my friends
            .mockResolvedValueOnce({ rows: [{ count: 9 }] })        // their friends
            .mockResolvedValueOnce({ rows: [{ count: 2 }] })        // my outgoing
            .mockResolvedValueOnce({ rows: [] });                   // insert

        expect(await friendsRepo.requestFriend(ME, THEM)).toBe('requested');
        const [sql, params] = mockQuery.mock.calls[4];
        expect(sql).toMatch(/INSERT INTO friendships/);
        expect(params).toEqual([ME, THEM, 'pending']);
    });

    /*
     * The case that would otherwise be a unique-violation on the pair key:
     * they asked first, and this call is the second half of an agreement. A
     * server error for two people doing exactly what the feature asks would be
     * an ugly way to learn the graph is directional.
     */
    test('accepts their standing request instead of inserting a mirror row', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [edgeRow(THEM, ME, 'pending')] })  // findEdge
            .mockResolvedValueOnce({ rows: [{ id: 7 }] });                    // accept UPDATE

        expect(await friendsRepo.requestFriend(ME, THEM)).toBe('accepted');
        expect(mockQuery.mock.calls[1][0]).toMatch(/UPDATE friendships/);
        expect(mockQuery.mock.calls.some(([sql]) => /INSERT INTO friendships/.test(sql))).toBe(false);
    });

    test.each([
        ['already-friends', 'accepted', ME, THEM],
        ['already-requested', 'pending', ME, THEM],
        // Told apart deliberately: a block placed ON me must look like nothing
        // at all, while one I placed is my own doing and worth naming — it is
        // the only way I would work out why a friend's code stopped working.
        ['blocked-by-me', 'blocked', ME, THEM],
        ['blocked', 'blocked', THEM, ME],
    ])('answers %s for an existing %s row', async (expected, status, requester, addressee) => {
        mockQuery.mockResolvedValueOnce({ rows: [edgeRow(requester, addressee, status)] });
        expect(await friendsRepo.requestFriend(ME, THEM)).toBe(expected);
    });

    test('refuses to befriend yourself', async () => {
        expect(await friendsRepo.requestFriend(ME, ME)).toBe('self');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    describe('caps', () => {
        test('refuses when my list is full', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ count: friendsRepo.MAX_FRIENDS }] });
            expect(await friendsRepo.requestFriend(ME, THEM)).toBe('cap-reached');
        });

        /*
         * Checked on THEIR side too: a request that could never be accepted is
         * better refused now than left pending forever, and their inbox is not
         * the place to store my overflow.
         */
        test('refuses when their list is full', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [{ count: friendsRepo.MAX_FRIENDS }] });
            expect(await friendsRepo.requestFriend(ME, THEM)).toBe('their-cap-reached');
        });

        // The only spam vector a mutual-accept graph has: papering inboxes.
        test('refuses past the outstanding-request cap', async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [{ count: 1 }] })
                .mockResolvedValueOnce({ rows: [{ count: friendsRepo.MAX_OUTGOING_REQUESTS }] });
            expect(await friendsRepo.requestFriend(ME, THEM)).toBe('request-cap-reached');
        });
    });
});

describe('acceptRequest', () => {
    test('only flips a PENDING row addressed to me', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] });
        expect(await friendsRepo.acceptRequest(ME, THEM)).toBe('accepted');

        const [sql, params] = mockQuery.mock.calls[0];
        // requester = them, addressee = me: a requester cannot accept their own.
        expect(params.slice(0, 2)).toEqual([ME, THEM]);
        expect(sql).toMatch(/requester_id = \$2 AND addressee_id = \$1/);
        expect(sql).toMatch(/status = \$4/);
    });

    /*
     * The cap rides INSIDE the update rather than in front of it: an account
     * that filled up while requests sat pending must not be able to exceed the
     * cap by accepting the backlog.
     */
    test('carries the cap in the same statement', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] });
        await friendsRepo.acceptRequest(ME, THEM);
        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toMatch(/SELECT count\(\*\) FROM friendships/);
        expect(params).toContain(friendsRepo.MAX_FRIENDS);
    });

    test('tells a full list from a missing request', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                                    // no update
            .mockResolvedValueOnce({ rows: [{ count: friendsRepo.MAX_FRIENDS }] }); // because full
        expect(await friendsRepo.acceptRequest(ME, THEM)).toBe('cap-reached');

        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ count: 3 }] });
        expect(await friendsRepo.acceptRequest(ME, THEM)).toBe('no-request');
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
    /*
     * DELETE then INSERT, in one transaction. Leaving an accepted row behind
     * would keep two people listed as friends while one had blocked the other,
     * and the pair key means the block cannot be inserted alongside it.
     */
    test('clears whatever the pair held, then stores the block on my row', async () => {
        mockClientQuery.mockResolvedValue({ rows: [] });
        expect(await friendsRepo.blockUser(ME, THEM)).toBe(true);

        const statements = mockClientQuery.mock.calls.map(([sql]) => sql.trim().split('\n')[0]);
        expect(statements[0]).toBe('BEGIN');
        expect(statements[1]).toMatch(/DELETE FROM friendships/);
        expect(statements[2]).toMatch(/INSERT INTO friendships/);
        expect(statements[3]).toBe('COMMIT');
        expect(mockClientQuery.mock.calls[2][1]).toEqual([ME, THEM, 'blocked']);
        expect(mockRelease).toHaveBeenCalled();
    });

    test('rolls back and releases the client when a statement throws', async () => {
        // A default so ROLLBACK itself resolves — a real pg client always
        // hands back a promise, and the rollback must not be the thing that
        // throws while handling a throw.
        mockClientQuery.mockResolvedValue({ rows: [] });
        mockClientQuery
            .mockResolvedValueOnce({ rows: [] })            // BEGIN
            .mockRejectedValueOnce(new Error('boom'));      // DELETE
        await expect(friendsRepo.blockUser(ME, THEM)).rejects.toThrow('boom');
        expect(mockClientQuery.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
        expect(mockRelease).toHaveBeenCalled();
    });

    test('refuses to block yourself, without touching the database', async () => {
        expect(await friendsRepo.blockUser(ME, ME)).toBe(false);
        expect(mockClientQuery).not.toHaveBeenCalled();
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

    /*
     * Blocks come back one way only. A block I placed is listed so I can lift
     * it — without that, blocking is a one-way door and the other person's
     * code simply stops working with nothing on screen to explain it. A block
     * placed ON me is never listed, which is what a block is for.
     */
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

    /*
     * Two tabs asking at once: the loser's conditional update matches no row,
     * and the next loop reads what the winner wrote rather than overwriting it.
     */
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
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: THEM }] })    // findByFriendCode
            .mockResolvedValueOnce({ rows: [] })                // findEdge
            .mockResolvedValueOnce({ rows: [{ count: 0 }] })
            .mockResolvedValueOnce({ rows: [{ count: 0 }] })
            .mockResolvedValueOnce({ rows: [{ count: 0 }] })
            .mockResolvedValueOnce({ rows: [] });               // insert
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

    /*
     * THE privacy rule of this feature. A block and a code nobody holds must
     * be indistinguishable from outside — otherwise the refusal itself tells
     * the blocked party they were blocked, and by whom.
     */
    test('POST answers a block exactly as it answers an unknown code', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });          // no such code
        const unknown = makeRes();
        await routes['POST /api/friends']({ user: USER, body: { code: 'ABC23XYZ' } }, unknown);

        mockQuery.mockReset();
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: THEM }] })                    // found
            .mockResolvedValueOnce({ rows: [edgeRow(THEM, ME, 'blocked')] });   // they blocked me
        const blocked = makeRes();
        await routes['POST /api/friends']({ user: USER, body: { code: 'ABC23XYZ' } }, blocked);

        expect(blocked.statusCode).toBe(unknown.statusCode);
        expect(blocked.body).toEqual(unknown.body);
    });

    test('PUT accept flips the request', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] });
        const res = makeRes();
        await routes['PUT /api/friends/:id']({ user: USER, params: { id: THEM }, body: { action: 'accept' } }, res);
        expect(res.statusCode).toBe(204);
    });

    test('PUT accept answers 404 when there is no request', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ count: 1 }] });
        const res = makeRes();
        await routes['PUT /api/friends/:id']({ user: USER, params: { id: THEM }, body: { action: 'accept' } }, res);
        expect(res.statusCode).toBe(404);
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
