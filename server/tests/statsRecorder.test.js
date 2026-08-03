/**
 * The socket→stats bridge's contract: authenticated sockets record, guests
 * and gone sockets are skipped silently, a dead database means nothing runs,
 * and a repo failure is swallowed — this rides game-over emits.
 */

const mockSockets = new Map();
jest.mock('../utils/initializeClient', () => ({
    io: { sockets: { sockets: mockSockets }, to: jest.fn(() => ({ emit: jest.fn() })), use: jest.fn() },
    server: { listen: jest.fn() },
    app: { use: jest.fn(), get: jest.fn(), put: jest.fn(), delete: jest.fn(), post: jest.fn() },
}));

const mockDbState = { enabled: true };
jest.mock('../utils/initializePgClient', () => ({
    pgPool: {},
    isDbEnabled: () => mockDbState.enabled,
    query: jest.fn(),
}));

const mockRecordResult = jest.fn();
jest.mock('../data/statsRepo', () => ({
    recordResult: (...args) => mockRecordResult(...args),
}));

const { recordForSockets, boardKeyOf } = require('../utils/statsRecorder');

const RESULT = { mode: 'daily', boardKey: '9x9/10', won: true, durationMs: 1000, players: 1, finishedAt: 1 };

beforeEach(() => {
    mockSockets.clear();
    mockRecordResult.mockReset().mockResolvedValue(undefined);
    mockDbState.enabled = true;
});

describe('boardKeyOf', () => {
    test('keys by what the board IS: dimensions and counted mines', () => {
        const board = [
            [{ isMine: true }, { isMine: false }, { isMine: false }],
            [{ isMine: false }, { isMine: true }, { isMine: false }],
        ];
        expect(boardKeyOf(board)).toBe('2x3/2');
    });
});

describe('recordForSockets', () => {
    test('records once per AUTHENTICATED socket; guests and ghosts skip', () => {
        mockSockets.set('sock-user', { data: { user: { id: 'uuid-1' } } });
        mockSockets.set('sock-guest', { data: { user: null } });
        // 'sock-gone' is not in the map at all — disconnected mid-game.

        recordForSockets(['sock-user', 'sock-guest', 'sock-gone'], RESULT);

        expect(mockRecordResult).toHaveBeenCalledTimes(1);
        expect(mockRecordResult).toHaveBeenCalledWith('uuid-1', RESULT);
    });

    test('does nothing at all without a database', () => {
        mockDbState.enabled = false;
        mockSockets.set('sock-user', { data: { user: { id: 'uuid-1' } } });
        recordForSockets(['sock-user'], RESULT);
        expect(mockRecordResult).not.toHaveBeenCalled();
    });

    test('a repo failure is swallowed, not thrown into the game path', async () => {
        mockSockets.set('sock-user', { data: { user: { id: 'uuid-1' } } });
        mockRecordResult.mockRejectedValue(new Error('pg down'));
        expect(() => recordForSockets(['sock-user'], RESULT)).not.toThrow();
        await new Promise((r) => setImmediate(r)); // let the rejection settle
    });
});
