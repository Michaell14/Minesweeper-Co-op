/**
 * The daily tie-in (PRD Phase 6): a signed-in player's leaderboard entry
 * carries their ACCOUNT display name — and since the avatars feature, their
 * account avatar — whatever name the client submitted. The anonymous path is
 * untouched: typed name, no avatar.
 */

const mockGetUserById = jest.fn();
jest.mock('../data/userRepo', () => ({
    getUserById: (...args) => mockGetUserById(...args),
}));

jest.mock('../data/dailyRepo', () => ({
    getAttempt: jest.fn(),
    submitScore: jest.fn(),
    getRank: jest.fn(),
    getEntryCount: jest.fn(),
    getLeaderboardTop: jest.fn(),
    TERMINAL_STATUSES: ['failed', 'won_pending_submit', 'completed'],
}));

const dailyRepo = require('../data/dailyRepo');
const { submitDailyScore } = require('../controllers/dailyController');

const makeSocket = (user) => ({
    data: { user },
    emit: jest.fn(),
    join: jest.fn(),
});

const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
const TOKEN = 'attempt-token-1';
const DATE = '2026-08-02';

beforeEach(() => {
    jest.clearAllMocks();
    // Default: the fresh read agrees with the socket snapshot.
    mockGetUserById.mockImplementation(async () => ({ displayName: 'Miguel', avatar: 'fox' }));
    dailyRepo.getAttempt.mockResolvedValue({ status: 'won_pending_submit' });
    dailyRepo.submitScore.mockResolvedValue(12345);
    dailyRepo.getRank.mockResolvedValue(3);
    dailyRepo.getEntryCount.mockResolvedValue(10);
    dailyRepo.getLeaderboardTop.mockResolvedValue([]);
});

test('a signed-in submit stores the ACCOUNT name and avatar, not the typed one', async () => {
    const socket = makeSocket({ id: 'uuid-1', displayName: 'Miguel', avatar: 'fox' });
    await submitDailyScore({ socket, io, dailyAttemptToken: TOKEN, date: DATE, name: 'Impostor' });
    expect(dailyRepo.submitScore).toHaveBeenCalledWith(DATE, TOKEN, 'Miguel', 'fox');
});

test('an anonymous submit stores the typed name and no avatar, exactly as before', async () => {
    const socket = makeSocket(null);
    await submitDailyScore({ socket, io, dailyAttemptToken: TOKEN, date: DATE, name: '  Guest  ' });
    expect(dailyRepo.submitScore).toHaveBeenCalledWith(DATE, TOKEN, 'Guest', null);
});

test('an account name is still normalised through the stored-name gate', async () => {
    mockGetUserById.mockResolvedValue({ displayName: '  Padded  ', avatar: 'fox' });
    const socket = makeSocket({ id: 'uuid-1', displayName: '  Padded  ' });
    await submitDailyScore({ socket, io, dailyAttemptToken: TOKEN, date: DATE, name: 'x' });
    expect(dailyRepo.submitScore).toHaveBeenCalledWith(DATE, TOKEN, 'Padded', 'fox');
});

test('name and avatar are RE-READ at submit — a mid-session repick lands, not the snapshot', async () => {
    mockGetUserById.mockResolvedValue({ displayName: 'Renamed', avatar: 'penguin' });
    const socket = makeSocket({ id: 'uuid-1', displayName: 'StaleSnapshot', avatar: 'classic' });
    await submitDailyScore({ socket, io, dailyAttemptToken: TOKEN, date: DATE, name: 'typed' });
    expect(dailyRepo.submitScore).toHaveBeenCalledWith(DATE, TOKEN, 'Renamed', 'penguin');
});

test('a deleted account falls through to the typed name, with no ghost avatar', async () => {
    mockGetUserById.mockResolvedValue(null);
    const socket = makeSocket({ id: 'uuid-1', displayName: 'GhostName', avatar: 'fox' });
    await submitDailyScore({ socket, io, dailyAttemptToken: TOKEN, date: DATE, name: 'Typed' });
    expect(dailyRepo.submitScore).toHaveBeenCalledWith(DATE, TOKEN, 'Typed', null);
});

test('an avatar id the catalog no longer knows is dropped, not carved into the list', async () => {
    mockGetUserById.mockResolvedValue({ displayName: 'Miguel', avatar: 'retired-avatar' });
    const socket = makeSocket({ id: 'uuid-1', displayName: 'Miguel' });
    await submitDailyScore({ socket, io, dailyAttemptToken: TOKEN, date: DATE, name: 'typed' });
    expect(dailyRepo.submitScore).toHaveBeenCalledWith(DATE, TOKEN, 'Miguel', null);
});

test('Postgres down keeps the snapshot rather than blocking the submit', async () => {
    mockGetUserById.mockRejectedValue(new Error('down'));
    const socket = makeSocket({ id: 'uuid-1', displayName: 'Miguel', avatar: 'fox' });
    await submitDailyScore({ socket, io, dailyAttemptToken: TOKEN, date: DATE, name: 'typed' });
    expect(dailyRepo.submitScore).toHaveBeenCalledWith(DATE, TOKEN, 'Miguel', 'fox');
});
