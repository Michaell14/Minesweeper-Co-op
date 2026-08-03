/**
 * The theme shelf: repo SQL shape, blob validation caps, and the controller's
 * one non-obvious policy — the cap gates NEW themes, never updates.
 */

const mockQuery = jest.fn();
jest.mock('../utils/initializePgClient', () => ({
    pgPool: {},
    isDbEnabled: () => true,
    query: (...args) => mockQuery(...args),
}));

jest.mock('../controllers/profileController', () => ({
    requireUser: jest.fn(),
}));

const themesRepo = require('../data/themesRepo');
const { registerThemesRoutes } = require('../controllers/themesController');
const { isValidThemeBlob, isValidThemeId } = require('../validation');

const THEME = {
    id: 'midnight',
    name: 'Midnight',
    core: { ink: '#ffffff', paper: '#101020' },
    palette: { '--ms-palette-ink': '#ffffff' },
};

beforeEach(() => mockQuery.mockReset());

describe('validation', () => {
    test.each([
        ['midnight', true],
        ['a', true],
        ['my-theme-2', true],
        ['UPPER', false],
        ['-leading-dash', false],
        ['x'.repeat(41), false],
        ['', false],
        [42, false],
    ])('theme id %p → %p', (id, valid) => {
        expect(isValidThemeId(id)).toBe(valid);
    });

    test('accepts a well-shaped blob and rejects the abuse shapes', () => {
        expect(isValidThemeBlob(THEME)).toBe(true);
        expect(isValidThemeBlob(null)).toBe(false);
        expect(isValidThemeBlob([])).toBe(false);
        expect(isValidThemeBlob({ ...THEME, id: 'Bad Id' })).toBe(false);
        expect(isValidThemeBlob({ ...THEME, name: '' })).toBe(false);
        expect(isValidThemeBlob({ ...THEME, name: 'x'.repeat(25) })).toBe(false);
        expect(isValidThemeBlob({ ...THEME, core: null })).toBe(false);
        expect(isValidThemeBlob({ ...THEME, palette: 'nope' })).toBe(false);
        expect(isValidThemeBlob({ ...THEME, palette: { pad: 'x'.repeat(17000) } })).toBe(false);
    });
});

describe('themesRepo', () => {
    test('saveTheme upserts on (user_id, id)', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await themesRepo.saveTheme('uuid-1', 'midnight', THEME);
        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toMatch(/ON CONFLICT \(user_id, id\)/);
        expect(params).toEqual(['uuid-1', 'midnight', JSON.stringify(THEME)]);
    });

    test('listThemes returns the blobs whole', async () => {
        mockQuery.mockResolvedValue({ rows: [{ theme: THEME }] });
        expect(await themesRepo.listThemes('uuid-1')).toEqual([THEME]);
    });

    test('deleteTheme reports whether a row went', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        expect(await themesRepo.deleteTheme('uuid-1', 'midnight')).toBe(true);
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        expect(await themesRepo.deleteTheme('uuid-1', 'gone')).toBe(false);
    });
});

describe('the routes', () => {
    const routes = {};
    const fakeApp = {
        get: (path, _mw, handler) => { routes[`GET ${path}`] = handler; },
        put: (path, _mw, handler) => { routes[`PUT ${path}`] = handler; },
        delete: (path, _mw, handler) => { routes[`DELETE ${path}`] = handler; },
    };
    registerThemesRoutes(fakeApp);

    const makeRes = () => {
        const res = { statusCode: 200, body: undefined, ended: false };
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (payload) => { res.body = payload; return res; };
        res.end = () => { res.ended = true; return res; };
        return res;
    };
    const USER = { id: 'uuid-1' };

    test('PUT stores a new theme under the cap', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                    // hasTheme: no
            .mockResolvedValueOnce({ rows: [{ count: 3 }] })        // countThemes
            .mockResolvedValueOnce({ rows: [] });                   // save
        const res = makeRes();
        await routes['PUT /api/themes/:id'](
            { user: USER, params: { id: 'midnight' }, body: { theme: THEME } },
            res,
        );
        expect(res.statusCode).toBe(204);
    });

    test('PUT refuses a NEW theme at the cap…', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })                    // hasTheme: no
            .mockResolvedValueOnce({ rows: [{ count: 20 }] });      // at cap
        const res = makeRes();
        await routes['PUT /api/themes/:id'](
            { user: USER, params: { id: 'midnight' }, body: { theme: THEME } },
            res,
        );
        expect(res.statusCode).toBe(409);
    });

    test('…but an UPDATE at the cap still lands', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ 1: 1 }] })            // hasTheme: yes
            .mockResolvedValueOnce({ rows: [] });                   // save
        const res = makeRes();
        await routes['PUT /api/themes/:id'](
            { user: USER, params: { id: 'midnight' }, body: { theme: THEME } },
            res,
        );
        expect(res.statusCode).toBe(204);
    });

    test('PUT rejects a body whose id disagrees with the URL', async () => {
        const res = makeRes();
        await routes['PUT /api/themes/:id'](
            { user: USER, params: { id: 'other' }, body: { theme: THEME } },
            res,
        );
        expect(res.statusCode).toBe(400);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('GET lists; DELETE is idempotent 204', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ theme: THEME }] });
        const res = makeRes();
        await routes['GET /api/themes']({ user: USER }, res);
        expect(res.body).toEqual({ themes: [THEME] });

        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        const res2 = makeRes();
        await routes['DELETE /api/themes/:id']({ user: USER, params: { id: 'gone' } }, res2);
        expect(res2.statusCode).toBe(204);
    });
});
