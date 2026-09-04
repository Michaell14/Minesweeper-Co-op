/**
 * The two modes must score the same move the same way. They did not: PVP
 * scored per safe cell opened, co-op per click (while its chord already scored
 * per cell). These tests drive the SAME board and click through both modes and
 * compare the score written, blind to the rule itself: only that the modes
 * agree and that the number tracks how much was opened.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const coop = require('../game/coop');
const pvp = require('../game/pvp');
const { redisClient } = require('../utils/initializeRedisClient');

const ROOM = 'r1';
const SOCKET = 'sock-1';

let client;

/**
 * 4x4 with one mine in the far corner, so opening (0,0) cascades: per-click
 * and per-cell rules only disagree when a move opens more than one cell.
 */
const cascadingBoard = () => {
    const board = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 }))
    );
    board[3][3] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    board[0][0].nearbyMines = 0;
    return board;
};

/** A board whose click opens exactly one cell, where the two rules coincide. */
const flatBoard = () => {
    const board = cascadingBoard();
    board[0][0].nearbyMines = 1;
    return board;
};

const coopState = (board) => ({
    gameOver: 'false',
    gameWon: 'false',
    initialized: 'true',
    noGuess: 'false',
    board: JSON.stringify(board),
    numRows: '4',
    numCols: '4',
    numMines: '1',
    players: JSON.stringify([SOCKET]),
});

const pvpState = (board) => ({
    pvpStarted: 'true',
    player1Board: JSON.stringify(board),
    player2Board: JSON.stringify(board),
    player1Initialized: 'true',
    player2Initialized: 'true',
    player1GameOver: 'false',
    player1GameWon: 'false',
    player2GameOver: 'false',
    player2GameWon: 'false',
    player1Progress: '0',
    player2Progress: '0',
    numRows: '4',
    numCols: '4',
    numMines: '1',
    players: JSON.stringify([SOCKET, 'sock-2']),
});

/** The score this player was left on, as a number. */
const scoreWritten = () => {
    const call = [...client.hSet.mock.calls].reverse().find((c) => c[0] === `player:${SOCKET}` && c[1].score);
    return call ? parseInt(call[1].score, 10) : 0;
};

/** How many cells any board write ended up with open. */
const openedCount = () => {
    const call = [...client.hSet.mock.calls]
        .reverse()
        .find((c) => c[1] && (c[1].board || c[1].player1Board));
    const board = JSON.parse(call[1].board || call[1].player1Board);
    return board.flat().filter((cell) => cell.isOpen).length;
};

const reset = () => {
    jest.clearAllMocks();
    client.hSet.mockResolvedValue(1);
    client.set.mockResolvedValue('OK');
    client.del.mockResolvedValue(1);
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'score') return '0';
        if (field === 'players') return JSON.stringify([SOCKET, 'sock-2']);
        if (field === 'gameWon') return 'false';
        if (field === 'name') return 'Alice';
        if (field === 'initialized') return 'true';
        return null;
    });
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:')
            ? { gameOver: 'false', gameWon: 'false', players: JSON.stringify([SOCKET, 'sock-2']) }
            : { name: 'Alice', score: '0', pvpPlayerIndex: '0' }
    );
};

/** Runs one move in each mode and reports what each scored. */
const scoreInBothModes = async (act) => {
    reset();
    await act.coop();
    const coopScore = scoreWritten();
    const coopOpened = openedCount();

    reset();
    await act.pvp();
    const pvpScore = scoreWritten();
    const pvpOpened = openedCount();

    // If the two modes did not open the same cells, equal scores prove nothing.
    expect(coopOpened).toBe(pvpOpened);

    return { coopScore, pvpScore, opened: coopOpened };
};

beforeEach(async () => {
    client = await redisClient;
    reset();
});

describe('a click that opens one cell', () => {
    test('scores the same in both modes', async () => {
        const { coopScore, pvpScore, opened } = await scoreInBothModes({
            coop: () => coop.openCell(0, 0, ROOM, SOCKET, coopState(flatBoard()), '0'),
            pvp: () => pvp.openCell(0, 0, ROOM, SOCKET, pvpState(flatBoard()), '0', { pvpPlayerIndex: '0' }),
        });

        expect(opened).toBe(1);
        expect(coopScore).toBe(pvpScore);
        expect(coopScore).toBe(1);
    });
});

describe('a click that cascades', () => {
    test('scores the same in both modes', async () => {
        const { coopScore, pvpScore } = await scoreInBothModes({
            coop: () => coop.openCell(0, 0, ROOM, SOCKET, coopState(cascadingBoard()), '0'),
            pvp: () => pvp.openCell(0, 0, ROOM, SOCKET, pvpState(cascadingBoard()), '0', { pvpPlayerIndex: '0' }),
        });

        expect(coopScore).toBe(pvpScore);
    });

    test('scores more than a click that opens one cell', async () => {
        // Both modes agreeing on "1 point per click" would pass the test above.
        const flat = await scoreInBothModes({
            coop: () => coop.openCell(0, 0, ROOM, SOCKET, coopState(flatBoard()), '0'),
            pvp: () => pvp.openCell(0, 0, ROOM, SOCKET, pvpState(flatBoard()), '0', { pvpPlayerIndex: '0' }),
        });
        const cascade = await scoreInBothModes({
            coop: () => coop.openCell(0, 0, ROOM, SOCKET, coopState(cascadingBoard()), '0'),
            pvp: () => pvp.openCell(0, 0, ROOM, SOCKET, pvpState(cascadingBoard()), '0', { pvpPlayerIndex: '0' }),
        });

        expect(cascade.opened).toBeGreaterThan(flat.opened);
        expect(cascade.coopScore).toBeGreaterThan(flat.coopScore);
        expect(cascade.coopScore).toBe(cascade.opened);
    });
});

describe('a chord', () => {
    // Chording was already per-cell in both modes; pinned so the click rule
    // cannot desync it again. (1,1) is open with one adjacent mine, at (2,2),
    // which is flagged, so the chord fires and opens the other seven neighbours.
    const chorded = () => {
        const board = Array.from({ length: 4 }, () =>
            Array.from({ length: 4 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 }))
        );
        board[2][2] = { isMine: true, isOpen: false, isFlagged: true, nearbyMines: 0 };
        board[1][1] = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 };
        return board;
    };

    test('scores the same in both modes', async () => {
        const { coopScore, pvpScore, opened } = await scoreInBothModes({
            coop: () => coop.chordCell(1, 1, ROOM, SOCKET, coopState(chorded())),
            pvp: () => pvp.chordCell(1, 1, ROOM, SOCKET, pvpState(chorded())),
        });

        expect(opened).toBe(8);          // the seven neighbours plus (1,1)
        expect(coopScore).toBe(pvpScore);
        expect(coopScore).toBe(7);       // scored per cell opened, not one per chord
    });

    /**
     * The board above cannot tell "per cell opened" from "per neighbour
     * opened" (both say 7). Here one neighbour cascades past the chord.
     */
    const chordThatCascades = () => {
        const board = Array.from({ length: 5 }, () =>
            Array.from({ length: 5 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 }))
        );
        board[0][0] = { isMine: true, isOpen: false, isFlagged: true, nearbyMines: 0 };
        board[1][1] = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 };
        board[2][2].nearbyMines = 0;     // cascades when the chord reaches it
        return board;
    };

    test('scores the cells its cascade opened, not just the neighbours it chorded', async () => {
        const { coopScore, pvpScore, opened } = await scoreInBothModes({
            coop: () => coop.chordCell(1, 1, ROOM, SOCKET, { ...coopState(chordThatCascades()), numRows: '5', numCols: '5' }),
            pvp: () => pvp.chordCell(1, 1, ROOM, SOCKET, { ...pvpState(chordThatCascades()), numRows: '5', numCols: '5' }),
        });

        expect(opened).toBeGreaterThan(8);   // the chord ran past its seven neighbours
        expect(coopScore).toBe(pvpScore);
        expect(coopScore).toBe(opened - 1);  // everything opened, less the already-open (1,1)
        expect(coopScore).toBeGreaterThan(7);
    });
});

describe('hitting a mine', () => {
    test('scores nothing in both modes', async () => {
        const { coopScore, pvpScore } = await scoreInBothModes({
            coop: () => coop.openCell(3, 3, ROOM, SOCKET, coopState(flatBoard()), '0'),
            pvp: () => pvp.openCell(3, 3, ROOM, SOCKET, pvpState(flatBoard()), '0', { pvpPlayerIndex: '0' }),
        });

        expect(coopScore).toBe(0);
        expect(pvpScore).toBe(0);
    });
});
