/**
 * When a PVP race ends, whose clock stops.
 *
 * PVP splits the clock: both players start together (one board, one moment, room
 * state) but finish separately, so a stop is normally sent to one socket. A
 * WINNER is the exception — it ends the race for both, and the loser is the easy
 * one to miss because nothing on their side ends. They are still mid-board when
 * it happens, so a per-socket stop leaves their timer counting under a dialog
 * saying the game is over, and their summary with no finish time to show.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const pvp = require('../game/pvp');
const { redisClient } = require('../utils/initializeRedisClient');

const ROOM = 'r1';
const WINNER = 'sock-winner';
let client;

/**
 * One mine at (0,0) and one safe cell still closed at (2,2). Opening that last
 * cell completes the board, which is what makes this a win through the real
 * entry point rather than by calling the internal checkWin directly.
 */
const oneCellFromWinning = () => {
    const b = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }))
    );
    b[0][0] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    b[2][2] = { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 };
    return b;
};

const PLAYER = { pvpPlayerIndex: '0' };

/** Opens the final safe cell as player 1. */
const winTheRace = (extra = {}) =>
    pvp.openCell(2, 2, ROOM, WINNER, roomState(extra), 0, PLAYER);

/** Who each emit of this event was addressed to. */
const targetsOf = (event) =>
    mockTo.mock.calls
        .map((call, i) => ({ target: call[0], sent: mockEmit.mock.calls[i] }))
        .filter(({ sent }) => sent && sent[0] === event)
        .map(({ target }) => target);

const clockPayloads = () =>
    mockEmit.mock.calls.filter(([event]) => event === 'gameClock').map(([, payload]) => payload);

const roomState = (extra = {}) => ({
    pvpStarted: 'true',
    startedAt: '1000',
    player1Board: JSON.stringify(oneCellFromWinning()),
    player2Board: JSON.stringify(oneCellFromWinning()),
    player1Initialized: 'true',
    player2Initialized: 'true',
    numRows: '3',
    numCols: '3',
    numMines: '1',
    totalSafeCells: '8',
    winnerSocket: '',
    player1GameOver: 'false',
    player1GameWon: 'false',
    player2GameOver: 'false',
    player2GameWon: 'false',
    players: JSON.stringify([WINNER, 'sock-loser']),
    ...extra,
});

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hSet.mockResolvedValue(1);
    client.set.mockResolvedValue('OK');
    client.del.mockResolvedValue(1);
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:') ? roomState() : { name: 'Winner', score: '0' }
    );
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'startedAt') return '1000';
        if (field === 'name') return 'Winner';
        return null;
    });
});

describe('a player completing their board', () => {
    test('stops the clock for the whole room, not just the winner', async () => {
        await winTheRace();

        expect(targetsOf('gameClock')).toEqual([ROOM]);
    });

    test('the stop carries the shared start, so both read the same duration', async () => {
        await winTheRace();

        const [payload] = clockPayloads();
        expect(payload.startedAt).toBe(1000);
        expect(payload.endedAt).not.toBeNull();
    });

    test('the win is announced alongside the stop', async () => {
        await winTheRace();

        expect(mockEmit.mock.calls.map(([event]) => event)).toContain('pvpPlayerWon');
    });
});

describe('a player finishing at the same moment as the winner', () => {
    /*
     * The only way to finish after someone else has won: this move was already
     * in flight. A move that STARTS once the race is decided is refused outright
     * — so the snapshot it carries still says the race is open, and only the
     * re-read inside checkWin sees the winner. Arranging it the other way round
     * would test a move the server no longer runs.
     */
    const arriveJustTooLate = async () => {
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:')
                ? roomState({ winnerSocket: 'sock-someone-else' })
                : { name: 'Latecomer', score: '0' }
        );

        await winTheRace();   // snapshot taken under the lock, before the win landed
    };

    /*
     * Their clock stopped when the race actually ended. Stamping it again here
     * would push their finish time out to whenever they happened to fill in the
     * rest of a board that no longer counted for anything.
     */
    test('does not restamp a clock the race already stopped', async () => {
        await arriveJustTooLate();

        expect(clockPayloads()).toHaveLength(0);
    });

    test('still records that they finished their own board', async () => {
        await arriveJustTooLate();

        const won = client.hSet.mock.calls.some(([, fields]) => fields && fields.player1GameWon === 'true');
        expect(won).toBe(true);
    });
});
