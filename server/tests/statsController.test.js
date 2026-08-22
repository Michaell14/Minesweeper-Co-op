/**
 * The stats routes' policy: what they answer, and what they refuse.
 *
 * Two of them matter beyond the usual shape checks. `/api/stats/bests` is what
 * the GAME reads now that a signed-in player's records live on the account, so
 * a 503 has to stay a 503 — the client falls back to the browser's copy on
 * anything that is not a table, and an empty 200 would read as "you have never
 * cleared a board". And the import route's 400 is the one that used to fire on
 * a perfectly ordinary payload: keys carry a group suffix, validation rejected
 * it, and one such record threw away the whole import.
 *
 * Auth is profileController's requireUser, mocked here — its own suite covers it.
 */

jest.mock('../controllers/profileController', () => ({
    requireUser: jest.fn(),
}));

const mockGetProfile = jest.fn();
const mockGetBoardBests = jest.fn();
const mockImportBests = jest.fn();
jest.mock('../data/statsRepo', () => ({
    getProfile: (...args) => mockGetProfile(...args),
    getBoardBests: (...args) => mockGetBoardBests(...args),
    importBests: (...args) => mockImportBests(...args),
}));

const { registerStatsRoutes } = require('../controllers/statsController');

const USER = { id: 'uuid-1' };

const routes = {};
const fakeApp = {
    get: (path, _mw, handler) => { routes[`GET ${path}`] = handler; },
    post: (path, _mw, handler) => { routes[`POST ${path}`] = handler; },
};
registerStatsRoutes(fakeApp);

const makeRes = () => {
    const res = { statusCode: 200, body: undefined, ended: false };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.body = payload; return res; };
    res.end = () => { res.ended = true; return res; };
    return res;
};

const call = async (route, req = {}) => {
    const res = makeRes();
    await routes[route]({ user: USER, ...req }, res);
    return res;
};

beforeEach(() => {
    mockGetProfile.mockReset();
    mockGetBoardBests.mockReset();
    mockImportBests.mockReset();
});

describe('GET /api/stats/bests', () => {
    test('answers with just this account\'s board records', async () => {
        const bests = [{ boardKey: '16x16/40@3', seconds: 41, players: 3, achievedAt: 'ts' }];
        mockGetBoardBests.mockResolvedValue(bests);

        const res = await call('GET /api/stats/bests');

        expect(mockGetBoardBests).toHaveBeenCalledWith('uuid-1');
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ boardBests: bests });
    });

    test('an account with no records answers with an empty table', async () => {
        mockGetBoardBests.mockResolvedValue([]);
        expect((await call('GET /api/stats/bests')).body).toEqual({ boardBests: [] });
    });

    /*
     * The client reads anything that is not a table as "fall back to this
     * browser". Answering 200-with-nothing instead would tell a player with
     * records that they have none.
     */
    test('a database failure is a 503, never an empty table', async () => {
        mockGetBoardBests.mockRejectedValue(new Error('down'));

        const res = await call('GET /api/stats/bests');

        expect(res.statusCode).toBe(503);
        expect(res.body).toEqual({ error: 'Stats are temporarily unavailable' });
    });

    test('does not build the whole profile to answer it', async () => {
        mockGetBoardBests.mockResolvedValue([]);
        await call('GET /api/stats/bests');
        expect(mockGetProfile).not.toHaveBeenCalled();
    });
});

describe('POST /api/stats/import-bests', () => {
    /* The bug: a browser that had ever cleared a board with a friend held a
     * suffixed key, and every import it offered was refused in full. */
    test('accepts a payload holding a group clear', async () => {
        mockImportBests.mockResolvedValue(undefined);
        const bests = [
            { boardKey: '9x9/10', seconds: 30, players: 1, achievedAt: 1 },
            { boardKey: '16x16/40@3', seconds: 41, players: 3, achievedAt: 2 },
        ];

        const res = await call('POST /api/stats/import-bests', { body: { bests } });

        expect(mockImportBests).toHaveBeenCalledWith('uuid-1', bests);
        expect(res.statusCode).toBe(204);
        expect(res.ended).toBe(true);
    });

    test.each([
        ['a missing body', {}],
        ['no bests field', { body: {} }],
        ['a record that is not one', { body: { bests: [{ boardKey: 'medium', seconds: 1, players: 1, achievedAt: 1 }] } }],
    ])('refuses %s without touching the repo', async (_label, req) => {
        const res = await call('POST /api/stats/import-bests', req);

        expect(res.statusCode).toBe(400);
        expect(mockImportBests).not.toHaveBeenCalled();
    });

    test('a database failure is a 503, not a silent success', async () => {
        mockImportBests.mockRejectedValue(new Error('down'));

        const res = await call('POST /api/stats/import-bests', {
            body: { bests: [{ boardKey: '9x9/10', seconds: 30, players: 1, achievedAt: 1 }] },
        });

        expect(res.statusCode).toBe(503);
    });
});
