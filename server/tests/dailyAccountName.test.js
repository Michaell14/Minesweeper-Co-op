/**
 * The daily tie-in (PRD Phase 6): a signed-in player's leaderboard entry
 * carries their ACCOUNT display name, whatever name the client submitted —
 * and the anonymous path is untouched.
 */

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
    dailyRepo.getAttempt.mockResolvedValue({ status: 'won_pending_submit' });
    dailyRepo.submitScore.mockResolvedValue(12345);
    dailyRepo.getRank.mockResolvedValue(3);
    dailyRepo.getEntryCount.mockResolvedValue(10);
    dailyRepo.getLeaderboardTop.mockResolvedValue([]);
});

test('a signed-in submit stores the ACCOUNT name, not the typed one', async () => {
    const socket = makeSocket({ id: 'uuid-1', displayName: 'Miguel' });
    await submitDailyScore({ socket, io, dailyAttemptToken: TOKEN, date: DATE, name: 'Impostor' });
    expect(dailyRepo.submitScore).toHaveBeenCalledWith(DATE, TOKEN, 'Miguel');
});

test('an anonymous submit stores the typed name, exactly as before', async () => {
    const socket = makeSocket(null);
    await submitDailyScore({ socket, io, dailyAttemptToken: TOKEN, date: DATE, name: '  Guest  ' });
    expect(dailyRepo.submitScore).toHaveBeenCalledWith(DATE, TOKEN, 'Guest');
});

test('an account name is still normalised through the stored-name gate', async () => {
    const socket = makeSocket({ id: 'uuid-1', displayName: '  Padded  ' });
    await submitDailyScore({ socket, io, dailyAttemptToken: TOKEN, date: DATE, name: 'x' });
    expect(dailyRepo.submitScore).toHaveBeenCalledWith(DATE, TOKEN, 'Padded');
});
