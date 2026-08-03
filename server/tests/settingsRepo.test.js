/**
 * The settings mirror, against a mocked pool. Load-bearing bits: the upsert
 * target (two tabs saving together), and that the blob goes in and comes out
 * whole — this repo never interprets it.
 */

const mockQuery = jest.fn();
jest.mock('../utils/initializePgClient', () => ({
    pgPool: {},
    isDbEnabled: () => true,
    query: (...args) => mockQuery(...args),
}));

const settingsRepo = require('../data/settingsRepo');

beforeEach(() => mockQuery.mockReset());

describe('getSettings', () => {
    test('returns the stored blob untouched', async () => {
        const blob = { version: 1, theme: 'gameboy' };
        mockQuery.mockResolvedValue({ rows: [{ settings: blob }] });
        expect(await settingsRepo.getSettings('uuid-1')).toEqual(blob);
        expect(mockQuery.mock.calls[0][1]).toEqual(['uuid-1']);
    });

    test('returns null for an account that has never synced', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        expect(await settingsRepo.getSettings('uuid-new')).toBeNull();
    });
});

describe('saveSettings', () => {
    test('upserts on user_id, last write winning', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        await settingsRepo.saveSettings('uuid-1', { version: 1, theme: 'dark' });

        const [sql, params] = mockQuery.mock.calls[0];
        expect(sql).toMatch(/ON CONFLICT \(user_id\)/);
        expect(sql).toMatch(/DO UPDATE SET settings = EXCLUDED\.settings/);
        expect(params).toEqual(['uuid-1', JSON.stringify({ version: 1, theme: 'dark' })]);
    });
});

describe('when Postgres is down', () => {
    test('errors propagate — the controller owns the policy', async () => {
        mockQuery.mockRejectedValue(new Error('connection refused'));
        await expect(settingsRepo.getSettings('uuid-1')).rejects.toThrow('connection refused');
    });
});
