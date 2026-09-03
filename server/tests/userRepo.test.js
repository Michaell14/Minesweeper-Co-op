/**
 * The users repo against a mocked pool. Asserts on the SQL's load-bearing
 * parts (ON CONFLICT target, what DO UPDATE touches), not the whole string.
 */

const mockQuery = jest.fn();
jest.mock('../utils/initializePgClient', () => ({
    pgPool: {},
    isDbEnabled: () => true,
    query: (...args) => mockQuery(...args),
}));

const userRepo = require('../data/userRepo');

const ROW = {
    id: 'uuid-1',
    provider: 'github',
    provider_account_id: '42',
    email: 'm@example.com',
    display_name: 'Michael',
    avatar: 'classic',
    created_at: new Date('2026-08-02T00:00:00Z'),
};

const USER = {
    id: 'uuid-1',
    provider: 'github',
    providerAccountId: '42',
    email: 'm@example.com',
    displayName: 'Michael',
    avatar: 'classic',
    createdAt: new Date('2026-08-02T00:00:00Z'),
};

beforeEach(() => mockQuery.mockReset());

describe('getOrCreateUser', () => {
    test('upserts on the OAuth identity and returns the camelCase row', async () => {
        mockQuery.mockResolvedValue({ rows: [ROW] });

        const user = await userRepo.getOrCreateUser({
            provider: 'github',
            providerAccountId: '42',
            email: 'm@example.com',
            displayName: 'Michael',
        });

        expect(user).toEqual(USER);
        const [sql, params] = mockQuery.mock.calls[0];
        // One statement, resilient to the two-tabs-signing-in race.
        expect(sql).toMatch(/ON CONFLICT \(provider, provider_account_id\)/);
        expect(params).toEqual(['github', '42', 'm@example.com', 'Michael']);
    });

    test('refreshes email but never display_name — renames must survive sign-ins', async () => {
        mockQuery.mockResolvedValue({ rows: [ROW] });

        await userRepo.getOrCreateUser({
            provider: 'github',
            providerAccountId: '42',
            email: 'new@example.com',
            displayName: 'From OAuth',
        });

        const [sql] = mockQuery.mock.calls[0];
        const doUpdate = sql.slice(sql.indexOf('DO UPDATE'));
        expect(doUpdate).toMatch(/email = EXCLUDED\.email/);
        expect(doUpdate).not.toMatch(/display_name/);
    });
});

describe('getUserById', () => {
    test('returns the user, or null for no row', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [ROW] });
        expect(await userRepo.getUserById('uuid-1')).toEqual(USER);

        mockQuery.mockResolvedValueOnce({ rows: [] });
        expect(await userRepo.getUserById('uuid-gone')).toBeNull();
    });
});

describe('updateUser', () => {
    test('returns the updated user', async () => {
        mockQuery.mockResolvedValue({ rows: [{ ...ROW, display_name: 'Miguel' }] });
        const user = await userRepo.updateUser('uuid-1', { displayName: 'Miguel' });
        expect(user).toEqual({ ...USER, displayName: 'Miguel' });
        expect(mockQuery.mock.calls[0][1]).toEqual(['uuid-1', 'Miguel', null]);
    });

    test('an omitted field keeps its stored value — null rides COALESCE', async () => {
        mockQuery.mockResolvedValue({ rows: [{ ...ROW, avatar: 'fox' }] });
        const user = await userRepo.updateUser('uuid-1', { avatar: 'fox' });
        expect(user).toEqual({ ...USER, avatar: 'fox' });
        // displayName was omitted, so its parameter is null and the SQL coalesces both columns.
        const [sql, params] = mockQuery.mock.calls[0];
        expect(params).toEqual(['uuid-1', null, 'fox']);
        expect(sql).toMatch(/display_name = COALESCE\(\$2, display_name\)/);
        expect(sql).toMatch(/avatar = COALESCE\(\$3, avatar\)/);
    });

    test('returns null when the account no longer exists', async () => {
        mockQuery.mockResolvedValue({ rows: [] });
        expect(await userRepo.updateUser('uuid-gone', { displayName: 'Miguel' })).toBeNull();
    });
});

describe('deleteUser', () => {
    test('reports whether a row actually went', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        expect(await userRepo.deleteUser('uuid-1')).toBe(true);

        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
        expect(await userRepo.deleteUser('uuid-1')).toBe(false);
    });
});

describe('when Postgres is down', () => {
    test('errors propagate — the caller owns the failure policy', async () => {
        mockQuery.mockRejectedValue(new Error('connection refused'));
        await expect(userRepo.getUserById('uuid-1')).rejects.toThrow('connection refused');
    });
});
