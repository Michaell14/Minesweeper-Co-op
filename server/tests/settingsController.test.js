/**
 * The settings routes' policy: the blob is opaque but capped (validation.js),
 * failures answer honestly, and auth is profileController's requireUser —
 * mocked here since its own suite covers it.
 */

jest.mock('../controllers/profileController', () => ({
    requireUser: jest.fn(),
}));

const mockGet = jest.fn();
const mockSave = jest.fn();
jest.mock('../data/settingsRepo', () => ({
    getSettings: (...args) => mockGet(...args),
    saveSettings: (...args) => mockSave(...args),
}));

const { registerSettingsRoutes } = require('../controllers/settingsController');
const { isValidSettingsBlob } = require('../validation');

const USER = { id: 'uuid-1' };

const routes = {};
const fakeApp = {
    get: (path, _mw, handler) => { routes[`GET ${path}`] = handler; },
    put: (path, _mw, handler) => { routes[`PUT ${path}`] = handler; },
};
registerSettingsRoutes(fakeApp);

const makeRes = () => {
    const res = { statusCode: 200, body: undefined, ended: false };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.body = payload; return res; };
    res.end = () => { res.ended = true; return res; };
    return res;
};

beforeEach(() => {
    mockGet.mockReset();
    mockSave.mockReset();
});

describe('isValidSettingsBlob', () => {
    test.each([
        [{ version: 1, theme: 'gameboy' }, true],
        [{}, true],
        [null, false],
        [['not', 'an', 'object'], false],
        ['{"version":1}', false],
        [42, false],
    ])('%p → %p', (blob, valid) => {
        expect(isValidSettingsBlob(blob)).toBe(valid);
    });

    test('rejects a blob over the size cap — accounts are not object storage', () => {
        expect(isValidSettingsBlob({ pad: 'x'.repeat(9000) })).toBe(false);
    });

    test('rejects a circular blob instead of throwing', () => {
        const blob = {};
        blob.self = blob;
        expect(isValidSettingsBlob(blob)).toBe(false);
    });
});

describe('GET /api/settings', () => {
    test('returns the stored blob', async () => {
        mockGet.mockResolvedValue({ version: 1, theme: 'c64' });
        const res = makeRes();
        await routes['GET /api/settings']({ user: USER }, res);
        expect(res.body).toEqual({ settings: { version: 1, theme: 'c64' } });
    });

    test('returns null, not 404, for a never-synced account', async () => {
        mockGet.mockResolvedValue(null);
        const res = makeRes();
        await routes['GET /api/settings']({ user: USER }, res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ settings: null });
    });

    test('503 when Postgres cannot answer', async () => {
        mockGet.mockRejectedValue(new Error('down'));
        const res = makeRes();
        await routes['GET /api/settings']({ user: USER }, res);
        expect(res.statusCode).toBe(503);
    });
});

describe('PUT /api/settings', () => {
    test('stores a valid blob and answers 204', async () => {
        mockSave.mockResolvedValue(undefined);
        const res = makeRes();
        await routes['PUT /api/settings'](
            { user: USER, body: { settings: { version: 1, theme: 'dark' } } },
            res,
        );
        expect(mockSave).toHaveBeenCalledWith('uuid-1', { version: 1, theme: 'dark' });
        expect(res.statusCode).toBe(204);
        expect(res.ended).toBe(true);
    });

    test.each([
        ['no body', {}],
        ['no settings key', { other: 1 }],
        ['a non-object blob', { settings: 'gameboy' }],
        ['an array blob', { settings: [1, 2] }],
    ])('400 for %s, without touching the repo', async (_label, body) => {
        const res = makeRes();
        await routes['PUT /api/settings']({ user: USER, body }, res);
        expect(res.statusCode).toBe(400);
        expect(mockSave).not.toHaveBeenCalled();
    });

    test('503 when Postgres cannot answer', async () => {
        mockSave.mockRejectedValue(new Error('down'));
        const res = makeRes();
        await routes['PUT /api/settings'](
            { user: USER, body: { settings: { version: 1 } } },
            res,
        );
        expect(res.statusCode).toBe(503);
    });
});
