/**
 * Tests for server/validation.js
 *
 * These rules were previously inlined in five server.js handlers with no test
 * coverage at all. They are ported verbatim, so this suite doubles as a record
 * of exactly what the socket layer accepts -- including one deliberately
 * preserved quirk in the hover bounds check.
 */

const { ALL_PRESETS, BOARD_LIMITS } = require('../../shared/boardConfig');
const {
    isValidRoomCode,
    isValidPlayerName,
    isValidMode,
    isValidBoardConfig,
    isValidCoordinate,
    isValidHoverCoordinate,
    isPlayerInRoom,
} = require('../validation');

describe('isValidRoomCode', () => {
    test.each([['abc'], ['a'], ['x'.repeat(100)], ['room with spaces'], ['123']])(
        'accepts %p',
        (room) => expect(isValidRoomCode(room)).toBe(true)
    );

    test.each([
        ['empty string', ''],
        ['too long', 'x'.repeat(101)],
        ['undefined', undefined],
        ['null', null],
        ['number', 123],
        ['object', { room: 'abc' }],
        ['array', ['abc']],
    ])('rejects %s', (_label, room) => expect(isValidRoomCode(room)).toBe(false));
});

describe('isValidPlayerName', () => {
    test.each([['Mike'], ['a'], ['x'.repeat(50)]])('accepts %p', (name) =>
        expect(isValidPlayerName(name)).toBe(true)
    );

    test.each([
        ['empty string', ''],
        ['too long', 'x'.repeat(51)],
        ['undefined', undefined],
        ['number', 42],
    ])('rejects %s', (_label, name) => expect(isValidPlayerName(name)).toBe(false));
});

describe('isValidMode', () => {
    test('accepts the two known modes', () => {
        expect(isValidMode('co-op')).toBe(true);
        expect(isValidMode('pvp')).toBe(true);
    });

    test.each([['coop'], ['CO-OP'], ['PVP'], [''], [undefined], [null], [0]])(
        'rejects %p',
        (mode) => expect(isValidMode(mode)).toBe(false)
    );
});

describe('isValidBoardConfig', () => {
    test.each(ALL_PRESETS.map((p) => [p.title, p]))(
        'accepts the shipped %s preset',
        (_title, preset) => {
            // Driven off shared/boardConfig, so adding a preset the server would
            // reject fails here instead of when a player picks it. Since size
            // and difficulty split into two axes this is every combination of
            // the two, not just the three that used to ship.
            expect(isValidBoardConfig(preset.rows, preset.cols, preset.mines)).toBe(true);
        }
    );

    test('accepts the boundary dimensions', () => {
        const { MIN_ROWS, MAX_ROWS, MIN_COLS, MAX_COLS, MIN_MINES } = BOARD_LIMITS;
        expect(isValidBoardConfig(MIN_ROWS, MIN_COLS, MIN_MINES)).toBe(true);
        expect(isValidBoardConfig(MAX_ROWS, MAX_COLS, (MAX_ROWS * MAX_COLS) / 2 - 1)).toBe(true);
    });

    test.each([
        ['too few rows', 7, 16, 40],
        ['too many rows', 33, 16, 40],
        ['too few cols', 16, 7, 40],
        ['too many cols', 16, 17, 40],
        ['zero mines', 16, 16, 0],
        ['negative mines', 16, 16, -1],
        ['mines exactly half the board', 16, 16, 128],
        ['mines beyond half the board', 16, 16, 200],
    ])('rejects %s', (_label, rows, cols, mines) =>
        expect(isValidBoardConfig(rows, cols, mines)).toBe(false)
    );

    test.each([
        ['string rows', '16', 16, 40],
        ['string mines', 16, 16, '40'],
        ['undefined cols', 16, undefined, 40],
    ])('rejects non-numeric input: %s', (_label, rows, cols, mines) =>
        expect(isValidBoardConfig(rows, cols, mines)).toBe(false)
    );

    test('rejects NaN dimensions (the inline version accepted them)', () => {
        // The old check was `numMines >= (numRows * numCols) / 2` -- a rejection
        // test. Every comparison with NaN is false, so NaN was never rejected and
        // produced a room whose board had zero rows. See validation.js.
        expect(isValidBoardConfig(NaN, 16, 40)).toBe(false);
        expect(isValidBoardConfig(16, NaN, 40)).toBe(false);
        expect(isValidBoardConfig(16, 16, NaN)).toBe(false);
    });
});

describe('isValidCoordinate', () => {
    test.each([
        [0, 0],
        [5, 9],
        [100, 100],
    ])('accepts (%i, %i)', (row, col) => expect(isValidCoordinate(row, col)).toBe(true));

    test.each([
        ['negative row', -1, 0],
        ['negative col', 0, -1],
        ['row above max', 101, 0],
        ['col above max', 0, 101],
        ['fractional', 1.5, 2],
        ['string', '1', 2],
        ['NaN', NaN, 0],
        ['Infinity', Infinity, 0],
        ['undefined', undefined, 0],
    ])('rejects %s', (_label, row, col) => expect(isValidCoordinate(row, col)).toBe(false));
});

describe('isValidHoverCoordinate', () => {
    test('accepts in-bounds coordinates', () => {
        expect(isValidHoverCoordinate(0, 0)).toBe(true);
        expect(isValidHoverCoordinate(100, 100)).toBe(true);
    });

    test('accepts the (-1, -1) "no hover" sentinel', () => {
        expect(isValidHoverCoordinate(-1, -1)).toBe(true);
    });

    test('PRESERVED QUIRK: skips the bounds check whenever either value is -1', () => {
        // The original inline check was
        //   if ((row !== -1 && col !== -1) && (row < 0 || row > 100 || ...)) return;
        // so a half-sentinel pair bypasses bounds entirely. Ported as-is; if this
        // is ever tightened, it is a deliberate behavior change, not a typo fix.
        expect(isValidHoverCoordinate(-1, 5000)).toBe(true);
        expect(isValidHoverCoordinate(5000, -1)).toBe(true);
    });

    test.each([
        ['out of bounds with no sentinel', 101, 5],
        ['negative other than -1', -2, 5],
        ['fractional', 1.5, 2],
        ['string', '1', 2],
        ['undefined', undefined, undefined],
    ])('rejects %s', (_label, row, col) =>
        expect(isValidHoverCoordinate(row, col)).toBe(false)
    );
});

describe('isPlayerInRoom', () => {
    test('finds a socket id present in the players list', () => {
        const roomState = { players: JSON.stringify(['a', 'b', 'c']) };

        expect(isPlayerInRoom(roomState, 'b')).toBe(true);
    });

    test('rejects a socket id that is not listed', () => {
        const roomState = { players: JSON.stringify(['a', 'b']) };

        expect(isPlayerInRoom(roomState, 'zzz')).toBe(false);
    });

    test.each([
        ['an empty players list', { players: '[]' }],
        ['a missing players field', {}],
        ['an undefined room state', undefined],
        ['a null room state', null],
    ])('returns false for %s', (_label, roomState) =>
        expect(isPlayerInRoom(roomState, 'a')).toBe(false)
    );

    test('returns false rather than throwing on malformed JSON', () => {
        // hGetAll can hand back anything; the old inline JSON.parse would throw
        // and get swallowed by the handler's try/catch.
        expect(() => isPlayerInRoom({ players: 'not json' }, 'a')).not.toThrow();
        expect(isPlayerInRoom({ players: 'not json' }, 'a')).toBe(false);
    });
});
