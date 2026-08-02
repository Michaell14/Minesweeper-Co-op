/**
 * Regression: a PVP action from a player with no assigned index must do nothing.
 *
 * pvpPlayerIndex is written by startPvpGame. openCell bailed out when it was
 * missing, but chordCell and toggleFlag fell back to `|| '0'` — index 0, which
 * addresses player1Board. So an action arriving before the game started, or from
 * a socket whose player record had expired, would read and WRITE the first
 * player's board: their flags and reveals, changed by someone else.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const pvp = require('../game/pvp');
const { pvpIndexOf } = require('../domain/pvpPlayer');
const { redisClient } = require('../utils/initializeRedisClient');

const ROOM = 'r1';
const STRANGER = 'sock-no-index';
let client;

/**
 * All closed except the centre, which is open and claims 0 adjacent mines — so
 * chording it genuinely proceeds and would write. A board where the chorded cell
 * was closed would make the chord test pass for the wrong reason.
 */
const board = () => {
    const b = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 }))
    );
    b[1][1] = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 0 };
    return b;
};

const startedRoom = () => ({
    pvpStarted: 'true',
    player1Board: JSON.stringify(board()),
    player2Board: JSON.stringify(board()),
    player1GameOver: 'false',
    player1GameWon: 'false',
    player2GameOver: 'false',
    player2GameWon: 'false',
    player1Progress: '0',
    numRows: '3',
    numCols: '3',
    numMines: '1',
    players: JSON.stringify(['sock-1', 'sock-2']),
});

/** Any write that would touch player 1's board or progress. */
const wroteToPlayerOne = () =>
    client.hSet.mock.calls.some(
        (c) => c[1] && Object.keys(c[1]).some((k) => k.startsWith('player1'))
    );

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hSet.mockResolvedValue(1);
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'players') return JSON.stringify(['sock-1', 'sock-2']);
        if (field === 'name') return 'Nobody';
        if (field === 'score') return '0';
        return null;
    });
    // The acting player has no pvpPlayerIndex.
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:') ? startedRoom() : { name: 'Nobody', score: '0' }
    );
});

describe.each([
    // chord the open centre; flag a closed corner. Each is a cell its action
    // would actually act on, so a pass means the guard worked, not that the
    // action bailed out for an unrelated reason.
    ['chordCell', () => pvp.chordCell(1, 1, ROOM, STRANGER, startedRoom())],
    ['toggleFlag', () => pvp.toggleFlag(0, 0, ROOM, STRANGER, startedRoom())],
])('%s from a player with no assigned index', (_name, act) => {
    test("does not write to player 1's board", async () => {
        await act();

        expect(wroteToPlayerOne()).toBe(false);
    });

    test('emits nothing', async () => {
        await act();

        expect(mockEmit).not.toHaveBeenCalled();
    });
});

describe('the same actions DO write when the index is present', () => {
    // Proves the tests above fail for the missing index, not because the board
    // made the action a no-op.
    beforeEach(() => {
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? startedRoom() : { name: 'P1', score: '0', pvpPlayerIndex: '0' }
        );
    });

    test('chordCell writes player 1 board', async () => {
        await pvp.chordCell(1, 1, ROOM, 'sock-1', startedRoom());
        expect(wroteToPlayerOne()).toBe(true);
    });

    test('toggleFlag writes player 1 board', async () => {
        await pvp.toggleFlag(0, 0, ROOM, 'sock-1', startedRoom());
        expect(wroteToPlayerOne()).toBe(true);
    });
});

describe('a player WITH an index still works', () => {
    test('toggleFlag flags a cell on their own board', async () => {
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? startedRoom() : { name: 'P2', score: '0', pvpPlayerIndex: '1' }
        );

        await pvp.toggleFlag(0, 0, ROOM, 'sock-2', startedRoom());

        const wrote = client.hSet.mock.calls.some((c) => c[1] && c[1].player2Board);
        expect(wrote).toBe(true);
        expect(mockEmit).toHaveBeenCalledWith('pvpUpdateCells', expect.any(Array));
    });

    test('player index 0 is a valid index, not a missing one', async () => {
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? startedRoom() : { name: 'P1', score: '0', pvpPlayerIndex: '0' }
        );

        await pvp.toggleFlag(0, 0, ROOM, 'sock-1', startedRoom());

        expect(client.hSet.mock.calls.some((c) => c[1] && c[1].player1Board)).toBe(true);
    });
});

/**
 * The rule itself, now that the socket handlers, the dispatch layer's choice of
 * lock key and the reset controller all derive the index from one place. It was
 * written out separately in each, and the copies disagreed: pvpController's
 * defaulted a missing index to 0.
 */
describe('pvpIndexOf', () => {
    test('reads the index a started game assigned', () => {
        expect(pvpIndexOf({ pvpPlayerIndex: '0' })).toBe(0);
        expect(pvpIndexOf({ pvpPlayerIndex: '1' })).toBe(1);
    });

    test.each([
        ['no player record', undefined],
        ['an empty player record', {}],
        ['a record with no index', { name: 'Nobody', score: '0' }],
        ['an empty index', { pvpPlayerIndex: '' }],
        ['a non-numeric index', { pvpPlayerIndex: 'first' }],
    ])('refuses %s rather than defaulting to player one', (_label, playerData) => {
        expect(pvpIndexOf(playerData)).toBeNull();
    });

    test('never returns 0 for anything but a real index 0', () => {
        // The whole point: 0 addresses player1Board, so a default hands a
        // stranger the first player's board to read, write and lock.
        const zeros = [undefined, {}, { pvpPlayerIndex: '' }, { pvpPlayerIndex: 'first' }]
            .map(pvpIndexOf)
            .filter((index) => index === 0);
        expect(zeros).toEqual([]);
    });
});
