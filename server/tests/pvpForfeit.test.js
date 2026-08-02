/**
 * Deciding a PVP race that ended in a disconnect.
 *
 * The server cannot tell a quit from a reload — both arrive as a disconnect — so
 * the forfeit waits to see whether the player comes back. These tests are about
 * that wait resolving the right way, because both wrong answers are bad and both
 * are silent: award too eagerly and refreshing the page loses you a game you were
 * winning; never award and a quitter leaves their opponent in a race that can
 * never end.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const { settleForfeit } = require('../utils/pvpForfeit');
const { redisClient } = require('../utils/initializeRedisClient');

const ROOM = 'r1';
const SURVIVOR = 'sock-survivor';
const DROPPED = 'sock-dropped';
let client;

/** A race whose other player has dropped out and not come back. */
const abandonedRace = (extra = {}) => ({
    mode: 'pvp',
    pvpStarted: 'true',
    startedAt: '1000',
    winnerSocket: '',
    player1GameWon: 'false',
    player2GameWon: 'false',
    players: JSON.stringify([SURVIVOR]),
    ...extra,
});

const emittedEvents = () => mockEmit.mock.calls.map(([event]) => event);

const arrange = (extra = {}) => {
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:') ? abandonedRace(extra) : { name: 'Survivor', score: '0' }
    );
};

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hSet.mockResolvedValue(1);
    client.hGet.mockImplementation(async (key, field) => (field === 'name' ? 'Survivor' : null));
    arrange();
});

describe('when the countdown runs out', () => {
    test('the player still there wins by default', async () => {
        await expect(settleForfeit(ROOM, SURVIVOR)).resolves.toBe(true);

        expect(emittedEvents()).toContain('pvpOpponentDisconnected');
    });

    test('the win is recorded, so a late return cannot un-win it', async () => {
        await settleForfeit(ROOM, SURVIVOR);

        const wrote = client.hSet.mock.calls.some(
            ([, fields]) => fields && fields.winnerSocket === SURVIVOR
        );
        expect(wrote).toBe(true);
    });

    test('their clock stops, because winning by default still ends the race', async () => {
        await settleForfeit(ROOM, SURVIVOR);

        const [clock] = mockEmit.mock.calls
            .filter(([event]) => event === 'gameClock')
            .map(([, payload]) => payload);
        expect(clock.startedAt).toBe(1000);
        expect(clock.endedAt).not.toBeNull();
    });
});

describe('when the player comes back first', () => {
    /*
     * The whole reason the forfeit waits. No flag is cleared on their return —
     * settling just looks at the room and finds it whole again, so there is no
     * cancellation anyone can forget to perform.
     */
    test('a refilled room cancels the forfeit', async () => {
        arrange({ players: JSON.stringify([SURVIVOR, DROPPED]) });

        await expect(settleForfeit(ROOM, SURVIVOR)).resolves.toBe(false);
        expect(emittedEvents()).not.toContain('pvpOpponentDisconnected');
    });

    test('nothing is written, so the race carries on untouched', async () => {
        arrange({ players: JSON.stringify([SURVIVOR, DROPPED]) });

        await settleForfeit(ROOM, SURVIVOR);

        expect(client.hSet).not.toHaveBeenCalled();
    });
});

describe('when the race ended on its own merits', () => {
    test('an outright winner is not overwritten by a forfeit', async () => {
        arrange({ winnerSocket: DROPPED });

        await expect(settleForfeit(ROOM, SURVIVOR)).resolves.toBe(false);
        expect(emittedEvents()).not.toContain('pvpOpponentDisconnected');
    });

    test('a completed board is not overwritten either', async () => {
        arrange({ player2GameWon: 'true' });

        await expect(settleForfeit(ROOM, SURVIVOR)).resolves.toBe(false);
    });

    test('a room that expired during the wait settles nothing', async () => {
        client.hGetAll.mockImplementation(async () => ({}));

        await expect(settleForfeit(ROOM, SURVIVOR)).resolves.toBe(false);
        expect(emittedEvents()).toHaveLength(0);
    });
});
