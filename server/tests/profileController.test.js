/**
 * The two transports' failure policies, which are deliberately opposite:
 * the socket path degrades to anonymous on every failure (auth being down must
 * never block a game), while the REST path answers honestly (401/503) because
 * account data is all it serves.
 *
 * The REST handlers are exercised through fake req/res objects rather than a
 * live Express app — what's under test is status-code policy and validation,
 * not Express routing.
 */

const mockVerify = jest.fn();
jest.mock('../utils/authToken', () => ({
    verifyBridgeToken: (...args) => mockVerify(...args),
}));

const mockGetOrCreate = jest.fn();
const mockUpdateName = jest.fn();
const mockDelete = jest.fn();
jest.mock('../data/userRepo', () => ({
    getOrCreateUser: (...args) => mockGetOrCreate(...args),
    updateDisplayName: (...args) => mockUpdateName(...args),
    deleteUser: (...args) => mockDelete(...args),
}));

const mockDbState = { enabled: true };
jest.mock('../utils/initializePgClient', () => ({
    pgPool: {},
    isDbEnabled: () => mockDbState.enabled,
    query: jest.fn(),
}));

const { resolveSocketUser, requireUser, registerProfileRoutes, clearIdentityCache } = require('../controllers/profileController');

const IDENTITY = { provider: 'github', providerAccountId: '42', email: 'm@example.com', name: 'Michael' };
const USER = { id: 'uuid-1', provider: 'github', providerAccountId: '42', email: 'm@example.com', displayName: 'Michael', createdAt: 'now' };

beforeEach(() => {
    // The identity cache would otherwise serve one test's user to the next.
    clearIdentityCache();
    mockVerify.mockReset();
    mockGetOrCreate.mockReset();
    mockUpdateName.mockReset();
    mockDelete.mockReset();
    mockDbState.enabled = true;
});

describe('resolveSocketUser', () => {
    test('a verified identity becomes a user, seeded with the OAuth name', async () => {
        mockVerify.mockReturnValue(IDENTITY);
        mockGetOrCreate.mockResolvedValue(USER);

        const user = await resolveSocketUser({ authToken: 'tok' });

        expect(user).toEqual(USER);
        expect(mockVerify).toHaveBeenCalledWith('tok');
        expect(mockGetOrCreate).toHaveBeenCalledWith({
            provider: 'github',
            providerAccountId: '42',
            email: 'm@example.com',
            displayName: 'Michael',
        });
    });

    test('an OAuth name that fails the stored-name rules falls back to the default', async () => {
        mockVerify.mockReturnValue({ ...IDENTITY, name: null });
        mockGetOrCreate.mockResolvedValue(USER);

        await resolveSocketUser({ authToken: 'tok' });

        expect(mockGetOrCreate.mock.calls[0][0].displayName).toBe('Player');
    });

    test.each([
        ['no auth object', undefined],
        ['no token', {}],
        ['an unverifiable token', { authToken: 'bad' }],
    ])('%s resolves to anonymous', async (_label, auth) => {
        mockVerify.mockReturnValue(null);
        expect(await resolveSocketUser(auth)).toBeNull();
        expect(mockGetOrCreate).not.toHaveBeenCalled();
    });

    test('a valid token with no database still resolves to anonymous', async () => {
        mockVerify.mockReturnValue(IDENTITY);
        mockDbState.enabled = false;
        expect(await resolveSocketUser({ authToken: 'tok' })).toBeNull();
    });

    test('a Postgres outage resolves to anonymous, never a thrown connection', async () => {
        mockVerify.mockReturnValue(IDENTITY);
        mockGetOrCreate.mockRejectedValue(new Error('connection refused'));
        expect(await resolveSocketUser({ authToken: 'tok' })).toBeNull();
    });
});

/** Minimal req/res pair recording what the middleware answered. */
const makeReq = (headers = {}, body = {}) => ({ headers, body });
const makeRes = () => {
    const res = { statusCode: 200, body: undefined, ended: false };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.body = payload; return res; };
    res.end = () => { res.ended = true; return res; };
    return res;
};

describe('requireUser', () => {
    test('503 with no database — the token may be fine, the service is not', async () => {
        mockDbState.enabled = false;
        const res = makeRes();
        await requireUser(makeReq({ authorization: 'Bearer tok' }), res, jest.fn());
        expect(res.statusCode).toBe(503);
    });

    test('401 without a verifiable bearer token', async () => {
        mockVerify.mockReturnValue(null);
        const res = makeRes();
        const next = jest.fn();
        await requireUser(makeReq({ authorization: 'Bearer bad' }), res, next);
        expect(res.statusCode).toBe(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('attaches req.user and calls next on a verified token', async () => {
        mockVerify.mockReturnValue(IDENTITY);
        mockGetOrCreate.mockResolvedValue(USER);
        const req = makeReq({ authorization: 'Bearer tok' });
        const next = jest.fn();
        await requireUser(req, makeRes(), next);
        expect(req.user).toEqual(USER);
        expect(next).toHaveBeenCalled();
    });
});

/**
 * Route handlers, captured from a fake app. requireUser is already covered, so
 * these run the terminal handler directly with req.user set.
 */
describe('the /api/me routes', () => {
    const routes = {};
    const fakeApp = {
        use: jest.fn(),
        get: (path, _mw, handler) => { routes[`GET ${path}`] = handler; },
        put: (path, _mw, handler) => { routes[`PUT ${path}`] = handler; },
        delete: (path, _mw, handler) => { routes[`DELETE ${path}`] = handler; },
    };
    registerProfileRoutes(fakeApp);

    test('GET returns the public shape — no providerAccountId', async () => {
        const req = { user: USER };
        const res = makeRes();
        await routes['GET /api/me'](req, res);
        expect(res.body.user).toEqual({
            id: 'uuid-1',
            provider: 'github',
            email: 'm@example.com',
            displayName: 'Michael',
            createdAt: 'now',
        });
        expect(res.body.user.providerAccountId).toBeUndefined();
    });

    test('PUT validates the STORED name: whitespace-only is rejected', async () => {
        const res = makeRes();
        await routes['PUT /api/me']({ user: USER, body: { displayName: '   ' } }, res);
        expect(res.statusCode).toBe(400);
        expect(mockUpdateName).not.toHaveBeenCalled();
    });

    test('PUT trims and stores a valid rename', async () => {
        mockUpdateName.mockResolvedValue({ ...USER, displayName: 'Miguel' });
        const res = makeRes();
        await routes['PUT /api/me']({ user: USER, body: { displayName: '  Miguel  ' } }, res);
        expect(mockUpdateName).toHaveBeenCalledWith('uuid-1', 'Miguel');
        expect(res.body.user.displayName).toBe('Miguel');
    });

    test('PUT answers 404 when the account vanished between auth and update', async () => {
        mockUpdateName.mockResolvedValue(null);
        const res = makeRes();
        await routes['PUT /api/me']({ user: USER, body: { displayName: 'Miguel' } }, res);
        expect(res.statusCode).toBe(404);
    });

    test('DELETE hard-deletes and answers 204, idempotently', async () => {
        mockDelete.mockResolvedValue(true);
        const res = makeRes();
        await routes['DELETE /api/me']({ user: USER }, res);
        expect(mockDelete).toHaveBeenCalledWith('uuid-1');
        expect(res.statusCode).toBe(204);
        expect(res.ended).toBe(true);

        // Already gone → still the outcome the caller wanted.
        mockDelete.mockResolvedValue(false);
        const res2 = makeRes();
        await routes['DELETE /api/me']({ user: USER }, res2);
        expect(res2.statusCode).toBe(204);
    });
});
