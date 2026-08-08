/**
 * The socket→stats bridge's contract: authenticated sockets record, guests
 * and gone sockets are skipped silently, a dead database means nothing runs,
 * and a repo failure is swallowed — this rides game-over emits.
 */

const mockSockets = new Map();
/** Every `io.to(id).emit(event, payload)` this module makes, in order. */
const emitted = [];
jest.mock('../utils/initializeClient', () => ({
    io: {
        sockets: { sockets: mockSockets },
        to: jest.fn((id) => ({ emit: (event, payload) => emitted.push({ id, event, payload }) })),
        use: jest.fn(),
    },
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

// dailyDate included to pin the pass-through contract: recordForSockets must
// hand the result to the repo verbatim, new fields riding along untouched.
const RESULT = { mode: 'daily', boardKey: '9x9/10', won: true, durationMs: 1000, players: 1, finishedAt: 1, dailyDate: '2026-08-02' };

beforeEach(() => {
    mockSockets.clear();
    emitted.length = 0;
    mockRecordResult.mockReset().mockResolvedValue(undefined);
    mockDbState.enabled = true;
});

/** Lets the recordResult promise and its .then settle. */
const settle = () => new Promise((r) => setImmediate(r));

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
        await settle();
    });
});

describe('the unlock announcement', () => {
    const { SERVER_EVENTS } = require('../../shared/events');

    test('tells the socket what it just unlocked', async () => {
        mockSockets.set('sock-user', { data: { user: { id: 'uuid-1' } } });
        mockRecordResult.mockResolvedValue(['first-clear', 'sweeper']);

        recordForSockets(['sock-user'], RESULT);
        await settle();

        expect(emitted).toEqual([{
            id: 'sock-user',
            event: SERVER_EVENTS.ACHIEVEMENTS_UNLOCKED,
            payload: { ids: ['first-clear', 'sweeper'] },
        }]);
    });

    test('says nothing when the result unlocked nothing', async () => {
        mockSockets.set('sock-user', { data: { user: { id: 'uuid-1' } } });
        mockRecordResult.mockResolvedValue([]);

        recordForSockets(['sock-user'], RESULT);
        await settle();

        expect(emitted).toEqual([]);
    });

    /*
     * The one that matters: a badge announced by a write that then failed is a
     * badge the profile will not have. The emit hangs off the resolution, so a
     * rejection can never reach it.
     */
    test('announces nothing when the write failed', async () => {
        mockSockets.set('sock-user', { data: { user: { id: 'uuid-1' } } });
        mockRecordResult.mockRejectedValue(new Error('pg down'));

        recordForSockets(['sock-user'], RESULT);
        await settle();

        expect(emitted).toEqual([]);
    });

    // Co-op finishes one board for everyone, but the shelves behind each
    // player differ — so this is per socket, never to the room.
    test('addresses each player separately', async () => {
        mockSockets.set('sock-a', { data: { user: { id: 'uuid-a' } } });
        mockSockets.set('sock-b', { data: { user: { id: 'uuid-b' } } });
        mockRecordResult
            .mockResolvedValueOnce(['first-clear'])
            .mockResolvedValueOnce([]);

        recordForSockets(['sock-a', 'sock-b'], RESULT);
        await settle();

        expect(emitted.map((e) => e.id)).toEqual(['sock-a']);
    });

    // A backend deployed ahead of the client, or the pre-achievements repo.
    test('survives a repo that returns nothing at all', async () => {
        mockSockets.set('sock-user', { data: { user: { id: 'uuid-1' } } });
        mockRecordResult.mockResolvedValue(undefined);

        recordForSockets(['sock-user'], RESULT);
        await settle();

        expect(emitted).toEqual([]);
    });

    /*
     * The finishing socket is not the socket to announce to. Each route dials
     * its own (ARCHITECTURE.md §5), so navigating to /daily or reconnecting
     * through a blip during the transaction leaves it dead — and emitting at a
     * captured id dropped the toast while the write landed fine.
     */
    test('follows the player to whatever socket they are on now', async () => {
        mockSockets.set('sock-old', { data: { user: { id: 'uuid-1' } } });
        mockRecordResult.mockResolvedValue(['first-clear']);

        recordForSockets(['sock-old'], RESULT);
        // Reconnected (or navigated) before the transaction came back.
        mockSockets.delete('sock-old');
        mockSockets.set('sock-new', { data: { user: { id: 'uuid-1' } } });
        await settle();

        expect(emitted.map((e) => e.id)).toEqual(['sock-new']);
    });

    test('reaches every tab the player has open', async () => {
        mockSockets.set('sock-a', { data: { user: { id: 'uuid-1' } } });
        mockSockets.set('sock-b', { data: { user: { id: 'uuid-1' } } });
        mockRecordResult.mockResolvedValue(['first-clear']);

        recordForSockets(['sock-a'], RESULT);
        await settle();

        expect(emitted.map((e) => e.id).sort()).toEqual(['sock-a', 'sock-b']);
    });

    // Closed the tab and did not come back: the row is written, and /profile's
    // unseen badge is what surfaces it. Nothing to emit at, and no throw.
    test('says nothing when the player has gone entirely', async () => {
        mockSockets.set('sock-user', { data: { user: { id: 'uuid-1' } } });
        mockRecordResult.mockResolvedValue(['first-clear']);

        recordForSockets(['sock-user'], RESULT);
        mockSockets.clear();
        await settle();

        expect(emitted).toEqual([]);
    });

    // A guest on the same box must not collect someone else's announcement.
    test('never announces to a socket belonging to another account', async () => {
        mockSockets.set('sock-user', { data: { user: { id: 'uuid-1' } } });
        mockSockets.set('sock-other', { data: { user: { id: 'uuid-2' } } });
        mockSockets.set('sock-guest', { data: { user: null } });
        mockRecordResult.mockResolvedValue(['first-clear']);

        recordForSockets(['sock-user'], RESULT);
        await settle();

        expect(emitted.map((e) => e.id)).toEqual(['sock-user']);
    });

    /*
     * A failed EMIT must not be reported as a failed WRITE. Under one trailing
     * `.catch` every socket problem printed "Stats write dropped" and sent
     * whoever was on call to look at a healthy Postgres.
     */
    test('a broken emit is logged as an announce failure, not a write failure', async () => {
        const { io } = require('../utils/initializeClient');
        mockSockets.set('sock-user', { data: { user: { id: 'uuid-1' } } });
        mockRecordResult.mockResolvedValue(['first-clear']);
        io.to.mockImplementationOnce(() => ({
            emit: () => { throw new Error('socket gone'); },
        }));
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {});

        try {
            recordForSockets(['sock-user'], RESULT);
            await settle();

            const messages = logged.mock.calls.map((call) => call.join(' '));
            expect(messages).toEqual(['Achievement announce dropped: socket gone']);
        } finally {
            logged.mockRestore();
        }
    });
});
