/**
 * Tests for server/game/index.js — mode dispatch.
 *
 * Routing used to be three `if (mode === 'pvp')` checks buried inside the co-op
 * implementations in boardUtils.js. Now that it is one module, it can be tested
 * directly: these assert that each action reaches the right mode module with the
 * arguments that module expects, including the legacy no-mode case.
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

let client;

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hGet.mockResolvedValue('7'); // player score
});

const withMode = (mode) => {
    const roomState = mode === undefined ? { numRows: '9' } : { mode, numRows: '9' };
    client.hGetAll.mockResolvedValue(roomState);
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

        expect(client.hGetAll).toHaveBeenCalledTimes(1);
        expect(client.hGetAll).toHaveBeenCalledWith('room:r1');
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
