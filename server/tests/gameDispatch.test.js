/**
 * Tests for server/game/index.js — mode dispatch.
 *
 * Routing used to be three `if (mode === 'pvp')` checks buried inside the co-op
 * implementations in boardUtils.js. Now that it is one module, it can be tested
 * directly: these assert that each action reaches the right mode module with the
 * arguments that module expects, including the legacy no-mode case.
 *
 * This is also where co-op takes the room's action lock, so these cover that it
 * is held around the call and released afterwards. Whether the lock actually
 * stops one move erasing another is tested against a stateful Redis in
 * coopConcurrency.test.js; there is nothing here for it to race with.
 */

jest.mock('../game/coop', () => ({
    openCell: jest.fn(),
    chordCell: jest.fn(),
    toggleFlag: jest.fn(),
}));

jest.mock('../game/pvp', () => ({
    openCell: jest.fn(),
    chordCell: jest.fn(),
    toggleFlag: jest.fn(),
}));

const coop = require('../game/coop');
const pvp = require('../game/pvp');
const { openCell, chordCell, toggleFlag, modeOf } = require('../game');
const { redisClient } = require('../utils/initializeRedisClient');
const { lockedBy, releasedLock } = require('./setup/lockAssertions');

let client;

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hGet.mockResolvedValue('7'); // player score
    client.set.mockResolvedValue('OK'); // action lock acquired
    client.del.mockResolvedValue(1);
});

const ACTION_LOCK = 'action_lock:r1';

const withMode = (mode) => {
    const roomState = mode === undefined ? { numRows: '9' } : { mode, numRows: '9' };
    client.hGetAll.mockResolvedValue(roomState);
    return roomState;
};

/** A pvp room where the acting socket holds `pvpPlayerIndex` (a Redis string). */
const withPvpPlayer = (pvpPlayerIndex) => {
    const roomState = { mode: 'pvp', numRows: '9' };
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:') ? roomState : { name: 'P', score: '7', pvpPlayerIndex }
    );
    return roomState;
};

describe('modeOf', () => {
    test('reads the mode field', () => {
        expect(modeOf({ mode: 'pvp' })).toBe('pvp');
        expect(modeOf({ mode: 'co-op' })).toBe('co-op');
    });

    test.each([
        ['a room with no mode field (created before PVP existed)', {}],
        ['an empty room state', undefined],
        ['a null room state', null],
    ])('defaults to co-op for %s', (_label, roomState) => {
        expect(modeOf(roomState)).toBe('co-op');
    });
});

describe('openCell', () => {
    test('routes a pvp room to the pvp module with player state', async () => {
        const roomState = withMode('pvp');

        await openCell(3, 4, 'r1', 'sock-1');

        expect(coop.openCell).not.toHaveBeenCalled();
        expect(pvp.openCell).toHaveBeenCalledWith(3, 4, 'r1', 'sock-1', roomState, '7', roomState);
    });

    test('routes a co-op room to the co-op module', async () => {
        const roomState = withMode('co-op');

        await openCell(3, 4, 'r1', 'sock-1');

        expect(pvp.openCell).not.toHaveBeenCalled();
        expect(coop.openCell).toHaveBeenCalledWith(3, 4, 'r1', 'sock-1', roomState, '7');
    });

    test('routes a room with no mode field to co-op', async () => {
        withMode(undefined);

        await openCell(0, 0, 'r1', 'sock-1');

        expect(coop.openCell).toHaveBeenCalled();
        expect(pvp.openCell).not.toHaveBeenCalled();
    });

    test('reads the player score alongside room state', async () => {
        withMode('co-op');

        await openCell(0, 0, 'r1', 'sock-1');

        expect(client.hGet).toHaveBeenCalledWith('player:sock-1', 'score');
        expect(client.hGetAll).toHaveBeenCalledWith('room:r1');
        expect(client.hGetAll).toHaveBeenCalledWith('player:sock-1');
    });
});

describe('chordCell', () => {
    test('routes a pvp room to the pvp module', async () => {
        const roomState = withMode('pvp');

        await chordCell(1, 2, 'r1', 'sock-1');

        expect(coop.chordCell).not.toHaveBeenCalled();
        expect(pvp.chordCell).toHaveBeenCalledWith(1, 2, 'r1', 'sock-1', roomState);
    });

    test('routes a co-op room to the co-op module', async () => {
        const roomState = withMode('co-op');

        await chordCell(1, 2, 'r1', 'sock-1');

        expect(pvp.chordCell).not.toHaveBeenCalled();
        expect(coop.chordCell).toHaveBeenCalledWith(1, 2, 'r1', 'sock-1', roomState);
    });

    test('does not read player state', async () => {
        withMode('co-op');

        await chordCell(1, 2, 'r1', 'sock-1');

        expect(client.hGetAll).not.toHaveBeenCalledWith('player:sock-1');
    });
});

describe('the co-op action lock', () => {
    test.each([
        ['openCell', () => openCell(3, 4, 'r1', 'sock-1')],
        ['chordCell', () => chordCell(1, 2, 'r1', 'sock-1')],
        ['toggleFlag', () => toggleFlag(5, 5, 'r1', 'sock-1')],
    ])('%s takes it and gives it back', async (_label, act) => {
        withMode('co-op');

        await act();

        expect(client.set).toHaveBeenCalledWith(ACTION_LOCK, lockedBy('sock-1'), { NX: true, EX: 5 });
        expect(releasedLock(client, ACTION_LOCK)).toBe(true);
    });

    test('gives it back even when the move throws, or the room wedges', async () => {
        withMode('co-op');
        coop.openCell.mockRejectedValueOnce(new Error('boom'));

        await expect(openCell(3, 4, 'r1', 'sock-1')).rejects.toThrow('boom');

        expect(releasedLock(client, ACTION_LOCK)).toBe(true);
    });

    test('hands the mode module the snapshot read UNDER the lock, not the one before it', async () => {
        // The pre-lock read only decides the mode. It predates the lock, so by
        // the time the move runs another player may have written over it —
        // acting on it is the whole bug.
        const forMode = { mode: 'co-op', tag: 'pre-lock' };
        const forTheMove = { mode: 'co-op', tag: 'under-lock' };
        client.hGetAll.mockResolvedValueOnce(forMode).mockResolvedValueOnce(forTheMove);

        await chordCell(1, 2, 'r1', 'sock-1');

        expect(coop.chordCell).toHaveBeenCalledWith(1, 2, 'r1', 'sock-1', forTheMove);
    });

    test('a pvp room does not take the ROOM lock — the two players race by design', async () => {
        withPvpPlayer('0');

        await openCell(3, 4, 'r1', 'sock-1');

        expect(client.set).not.toHaveBeenCalledWith(ACTION_LOCK, expect.anything(), expect.anything());
    });
});

/**
 * PVP players own separate board fields, so serialising them against each other
 * would break the race. Each is serialised against ONLY themselves.
 */
describe('the pvp per-player action lock', () => {
    test.each([
        ['openCell', () => openCell(3, 4, 'r1', 'sock-1')],
        ['chordCell', () => chordCell(1, 2, 'r1', 'sock-1')],
        ['toggleFlag', () => toggleFlag(5, 5, 'r1', 'sock-1')],
    ])('%s takes the acting player lock and gives it back', async (_label, act) => {
        withPvpPlayer('0');

        await act();

        expect(client.set).toHaveBeenCalledWith('action_lock:r1:p0', lockedBy('sock-1'), { NX: true, EX: 5 });
        expect(releasedLock(client, 'action_lock:r1:p0')).toBe(true);
    });

    test('player two locks a different key, so neither ever waits on the other', async () => {
        withPvpPlayer('1');

        await openCell(3, 4, 'r1', 'sock-1');

        expect(client.set).toHaveBeenCalledWith('action_lock:r1:p1', lockedBy('sock-1'), { NX: true, EX: 5 });
        expect(client.set).not.toHaveBeenCalledWith('action_lock:r1:p0', expect.anything(), expect.anything());
    });

    test('index 0 is locked, not skipped — pvpPlayerIndex is the string "0"', async () => {
        // '0' is truthy as a Redis string but 0 is falsy as a number; getting
        // this wrong leaves player one the only unserialised player.
        withPvpPlayer('0');

        await openCell(3, 4, 'r1', 'sock-1');

        expect(client.set).toHaveBeenCalledWith('action_lock:r1:p0', lockedBy('sock-1'), { NX: true, EX: 5 });
    });

    test('a socket with no index gets no lock, and the move is refused downstream', async () => {
        withPvpPlayer(undefined);

        await openCell(3, 4, 'r1', 'sock-1');

        expect(client.set).not.toHaveBeenCalledWith(
            expect.stringContaining('action_lock:'), expect.anything(), expect.anything()
        );
        expect(pvp.openCell).toHaveBeenCalled();
    });
});

describe('toggleFlag', () => {
    test('routes a pvp room to the pvp module', async () => {
        const roomState = withMode('pvp');

        await toggleFlag(5, 5, 'r1', 'sock-1');

        expect(coop.toggleFlag).not.toHaveBeenCalled();
        expect(pvp.toggleFlag).toHaveBeenCalledWith(5, 5, 'r1', 'sock-1', roomState);
    });

    test('routes a co-op room to the co-op module', async () => {
        const roomState = withMode('co-op');

        await toggleFlag(5, 5, 'r1', 'sock-1');

        expect(pvp.toggleFlag).not.toHaveBeenCalled();
        expect(coop.toggleFlag).toHaveBeenCalledWith(5, 5, 'r1', 'sock-1', roomState);
    });
});
