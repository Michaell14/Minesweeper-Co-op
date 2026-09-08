/**
 * Tests for server/validation.js. The rules were ported verbatim from inline
 * handler checks, so this suite is a record of what the socket layer accepts.
 */

const { ALL_PRESETS, BOARD_LIMITS } = require('../../shared/boardConfig');
const { EMOTE_IDS } = require('../../shared/emotes');
const {
    isValidRoomCode,
    isValidPlayerName,
    isValidMode,
    isValidBoardConfig,
    isValidCoordinate,
    isValidHoverCoordinate,
    isCoordinateOnBoard,
    isValidEmoteId,
    isPlayerInRoom,
    isValidBestImport,
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
            // Driven off shared/boardConfig, so a preset the server would reject
            // fails here instead of when a player picks it.
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
        // Every comparison with NaN is false, so a rejection-style check never
        // rejected it and produced a room whose board had zero rows.
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

    test('rejects a HALF sentinel, which is neither a cell nor a clear', () => {
        // The client clears only on the (-1, -1) pair, so a half sentinel was
        // drawn as a cursor off the board and nothing could ever clear it.
        expect(isValidHoverCoordinate(-1, 5000)).toBe(false);
        expect(isValidHoverCoordinate(5000, -1)).toBe(false);
        expect(isValidHoverCoordinate(-1, 5)).toBe(false);
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

describe('isCoordinateOnBoard', () => {
    // Redis hands every field back as a string.
    const room = { numRows: '9', numCols: '9' };

    test.each([
        ['the first cell', 0, 0],
        ['the last cell', 8, 8],
        ['somewhere inside', 4, 7],
    ])('accepts %s', (_label, row, col) => expect(isCoordinateOnBoard(room, row, col)).toBe(true));

    /* The bound is EXCLUSIVE: a 9x9 board's rows are 0..8. */
    test.each([
        ['one row past the end', 9, 0],
        ['one column past the end', 0, 9],
        ['a negative row', -1, 0],
        ['the hover clear sentinel', -1, -1],
    ])('rejects %s', (_label, row, col) => expect(isCoordinateOnBoard(room, row, col)).toBe(false));

    // No dimensions must refuse rather than fall through to the global cap.
    test.each([
        ['a room with no dimensions', {}],
        ['a missing room', undefined],
        ['non-numeric dimensions', { numRows: 'lots', numCols: '9' }],
    ])('rejects %s', (_label, state) => expect(isCoordinateOnBoard(state, 0, 0)).toBe(false));
});

describe('isValidEmoteId', () => {
    test.each(EMOTE_IDS)('accepts the catalog id %s', (id) =>
        expect(isValidEmoteId(id)).toBe(true)
    );

    /*
     * Keeps the vocabulary CLOSED: anything outside the catalog would be
     * relayed verbatim between players, which is chat, and chat needs moderation.
     */
    test.each([
        ['a plain sentence', 'meet me at 3pm'],
        ['markup', '<img src=x onerror=alert(1)>'],
        ['an id that only looks close', 'nice '],
        ['the empty string', ''],
        ['a number', 3],
        ['null', null],
        ['undefined', undefined],
        ['an object', { id: 'nice' }],
    ])('rejects %s', (_label, value) => expect(isValidEmoteId(value)).toBe(false));
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
        // hGetAll can hand back anything; a throw here would be swallowed by the handler.
        expect(() => isPlayerInRoom({ players: 'not json' }, 'a')).not.toThrow();
        expect(isPlayerInRoom({ players: 'not json' }, 'a')).toBe(false);
    });
});


/**
 * The guest best-times import: client-reported records, so this is the whole
 * gate (statsRepo's keep-if-faster upsert makes the numbers harmless). The
 * GROUP SUFFIX ('@3') once 400'd the entire payload under `every`, so a
 * browser that had ever cleared a board with a friend could not import at all.
 */
describe('isValidBestImport', () => {
    const record = (over = {}) => ({ boardKey: '16x16/40', seconds: 90, players: 1, achievedAt: 1, ...over });

    test('accepts a solo record', () => {
        expect(isValidBestImport([record()])).toBe(true);
    });

    test('accepts a group clear, suffix and all', () => {
        expect(isValidBestImport([record({ boardKey: '16x16/40@3', players: 3 })])).toBe(true);
    });

    test('one group clear no longer throws away the whole payload', () => {
        expect(isValidBestImport([
            record(),
            record({ boardKey: '9x9/10@2', players: 2 }),
            record({ boardKey: '30x16/99' }),
        ])).toBe(true);
    });

    test('an empty import is valid and does nothing', () => {
        expect(isValidBestImport([])).toBe(true);
    });

    test.each([
        ['a key that is not a board', 'medium'],
        ['a label instead of numbers', 'Medium/40'],
        ['a suffix with no count', '16x16/40@'],
        ['a non-numeric suffix', '16x16/40@many'],
        ['a second suffix', '16x16/40@2@2'],
        ['dimensions out of bounds', '1000x1000/40'],
    ])('rejects %s', (_label, boardKey) => {
        expect(isValidBestImport([record({ boardKey })])).toBe(false);
    });

    test.each([
        ['a negative time', { seconds: -1 }],
        ['a time longer than a day', { seconds: 86_401 }],
        ['a fractional player count', { players: 1.5 }],
        ['no players at all', { players: 0 }],
        ['a missing timestamp', { achievedAt: undefined }],
    ])('rejects %s', (_label, over) => {
        expect(isValidBestImport([record(over)])).toBe(false);
    });

    test.each([
        ['not an array', { boardKey: '16x16/40' }],
        ['null', null],
        ['a list of nulls', [null]],
    ])('rejects %s', (_label, payload) => {
        expect(isValidBestImport(payload)).toBe(false);
    });

    test('rejects a payload past the entry cap', () => {
        expect(isValidBestImport(Array.from({ length: 101 }, () => record()))).toBe(false);
    });
});
