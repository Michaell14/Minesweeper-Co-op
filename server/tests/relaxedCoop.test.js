const mockEmit = jest.fn();
jest.mock('../utils/initializeClient', () => ({ io: { to: jest.fn(() => ({ emit: mockEmit })) }, server: {} }));
const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();
jest.mock('../utils/initializeRedisClient', () => ({ redisClient: Promise.resolve(mockRedis) }));
const { openCell, chordCell } = require('../game');
const { resetGame, createRoom } = require('../utils/gameUtils');
const { addPlayerToRoom } = require('../utils/playerUtils');
const { SERVER_EVENTS: E } = require('../../shared/events');
const { boardKey, BOARD_KEY_PATTERN } = require('../../shared/boardKeys');

const room = () => mockRedis.read('room:relax');
const board = () => JSON.parse(room().board);
const events = (name) => mockEmit.mock.calls.filter(([event]) => event === name);
function seed(extra = {}) {
    const cells = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () =>
        ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 })));
    cells[0][0].isMine = cells[0][1].isMine = cells[0][2].isMine = true;
    mockRedis.seed('room:relax', { mode: 'co-op', relaxed: 'true', livesRemaining: '3',
        gameOver: 'false', gameWon: 'false', initialized: 'true', noGuess: 'false',
        board: JSON.stringify(cells), numRows: '4', numCols: '4', numMines: '3',
        players: '["alice","bob"]', startedAt: '1000', ...extra });
    for (const id of ['alice', 'bob']) mockRedis.seed(`player:${id}`, { name: id, room: 'relax', score: '0' });
}
beforeEach(() => { mockRedis.flush(); mockEmit.mockClear(); seed(); });

test('first two mines preserve play and clock; the third ends the shared game once', async () => {
    await openCell(0, 0, 'relax', 'alice');
    expect(room().livesRemaining).toBe('2');
    expect(room().gameOver).toBe('false');
    expect(events(E.GAME_OVER)).toHaveLength(0);
    expect(events(E.GAME_CLOCK)).toHaveLength(0);
    expect(events(E.UPDATE_CELLS).at(-1)[1][0]).toMatchObject({ isMine: true, isOpen: true });
    expect(events(E.BOARD_UPDATE)).toHaveLength(0);
    await openCell(0, 0, 'relax', 'bob');
    expect(room().livesRemaining).toBe('2');
    await openCell(3, 3, 'relax', 'bob');
    expect(board()[3][3].isOpen).toBe(true);
    await openCell(0, 1, 'relax', 'bob');
    expect(room().livesRemaining).toBe('1');
    await openCell(0, 2, 'relax', 'alice');
    expect(room().livesRemaining).toBe('0');
    expect(room().gameOver).toBe('true');
    expect(events(E.GAME_OVER)).toHaveLength(1);
    await openCell(2, 2, 'relax', 'bob');
    expect(board()[2][2].isOpen).toBe(false);
});

test('concurrent teammates consume shared lives without losing either update', async () => {
    await Promise.all([openCell(0, 0, 'relax', 'alice'), openCell(0, 1, 'relax', 'bob')]);
    expect(room().livesRemaining).toBe('1');
    expect(board()[0][0].isOpen && board()[0][1].isOpen).toBe(true);
});

test('a mistaken chord stops after its first mine', async () => {
    const cells = board();
    cells[1][1].isOpen = true;
    cells[2][1].isFlagged = true;
    mockRedis.seed('room:relax', { ...room(), board: JSON.stringify(cells) });
    await chordCell(1, 1, 'relax', 'alice');
    expect(room().livesRemaining).toBe('2');
    expect(board()[0].filter((c) => c.isMine && c.isOpen)).toHaveLength(1);
    expect(events(E.UPDATE_CELLS).at(-1)[1]).toEqual(expect.arrayContaining([expect.objectContaining({ isMine: true, isOpen: true })]));
});

test('uncovered mines count toward a subsequent chord', async () => {
    const cells = board();
    cells[0][0].isOpen = true;
    cells[1][0].isOpen = true;
    cells[1][0].nearbyMines = 2;
    cells[0][1].isFlagged = true;
    mockRedis.seed('room:relax', { ...room(), livesRemaining: '2', board: JSON.stringify(cells) });
    await chordCell(1, 0, 'relax', 'alice');
    expect(board()[2][0].isOpen).toBe(true);
    expect(room().livesRemaining).toBe('2');
});

test('reset restores three lives and preserves relaxed rules', async () => {
    await openCell(0, 0, 'relax', 'alice');
    await resetGame('relax');
    expect(room()).toMatchObject({ relaxed: 'true', livesRemaining: '3', gameOver: 'false', initialized: 'false' });
    expect(events(E.COOP_LIVES).at(-1)[1]).toEqual({ room: 'relax', relaxed: true, livesRemaining: 3 });
});

test('join restores remaining lives without revealing hidden mines', async () => {
    await openCell(0, 0, 'relax', 'alice');
    await addPlayerToRoom('relax', 'charlie', 'Charlie');
    expect(events(E.COOP_LIVES).at(-1)[1]).toMatchObject({ relaxed: true, livesRemaining: 2 });
    const projected = events(E.BOARD_UPDATE).at(-1)[1];
    expect(projected[0][0].isMine).toBe(true);
    expect(projected[0][1].isMine).toBe(false);
});

test('a relaxed game can win after hitting mines', async () => {
    await openCell(0, 0, 'relax', 'alice');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (!board()[r][c].isMine) await openCell(r, c, 'relax', 'bob');
    }
    expect(room()).toMatchObject({ gameWon: 'true', gameOver: 'false', livesRemaining: '2' });
    expect(events(E.GAME_WON)).toHaveLength(1);
});

test('classic and legacy rooms still end on the first mine', async () => {
    seed({ relaxed: 'false', livesRemaining: '1' });
    await openCell(0, 0, 'relax', 'alice');
    expect(room().gameOver).toBe('true');
    expect(events(E.GAME_OVER)).toHaveLength(1);
});

test('creation enables lives only in co-op and record keys stay separate', async () => {
    await createRoom('new', 4, 4, 3, 'co-op', true, true);
    expect(mockRedis.read('room:new')).toMatchObject({ relaxed: 'true', livesRemaining: '3' });
    await createRoom('pvp', 4, 4, 3, 'pvp', true, true);
    expect(mockRedis.read('room:pvp').relaxed).toBe('false');
    expect(boardKey(16, 16, 40, 2, true)).toBe('relaxed:16x16/40@2');
    expect(BOARD_KEY_PATTERN.test(boardKey(16, 16, 40, 2, true))).toBe(true);
    expect(boardKey(16, 16, 40, 2)).toBe('16x16/40@2');
});

test('relaxed configuration rejects malformed input and PvP lives', () => {
    const { isValidRelaxed } = require('../validation');
    expect(isValidRelaxed('co-op', true)).toBe(true);
    expect(isValidRelaxed('co-op', undefined)).toBe(true);
    expect(isValidRelaxed('co-op', 'true')).toBe(false);
    expect(isValidRelaxed('pvp', true)).toBe(false);
});

test('relaxed clears cannot award classic skill achievements', () => {
    const { earnedFrom } = require('../domain/achievements');
    expect(earnedFrom({}, { mode: 'co-op', boardKey: 'relaxed:16x16/40', won: true, durationMs: 1000, players: 1 })).toEqual([]);
    expect(earnedFrom({}, { mode: 'co-op', boardKey: '16x16/40', won: true, durationMs: 1000, players: 1 })).toContain('speed-demon');
});
