/**
 * The stored board format (domain/boardCodec.js). Pure, so no Redis: what
 * matters is that every cell state survives the trip, that boards written as
 * JSON before the format existed still read, that a corrupt value fails loudly
 * instead of decoding to a different board, and that it is as small as it
 * claims. The repos are its only callers; tests/repos.test.js covers that.
 */

const { encodeBoard, decodeBoard } = require('../domain/boardCodec');
const { createEmptyBoard, revealFrom } = require('../domain/board');
const { generateBoard } = require('../domain/boardGen');

/** One cell per state the format holds: the 8 flag combinations x nearbyMines 0-8. */
const everyCellState = () =>
    Array.from({ length: 8 }, (_, flags) =>
        Array.from({ length: 9 }, (_, nearbyMines) => ({
            isMine: (flags & 1) !== 0,
            isOpen: (flags & 2) !== 0,
            isFlagged: (flags & 4) !== 0,
            nearbyMines,
        })));

/** The cell characters, without the `b1:<rows>x<cols>:` header. */
const cellsOf = (encoded) => encoded.slice(encoded.indexOf(':', 3) + 1);

/** A board partway through a game: an opening cascade, plus a flag. */
const midGameBoard = (rows, cols, mines) => {
    const startRow = Math.floor(rows / 2);
    const startCol = Math.floor(cols / 2);
    const board = generateBoard(rows, cols, mines, startRow, startCol);
    revealFrom(board, startRow, startCol, []);
    const mine = board.flat().find((cell) => cell.isMine);
    mine.isFlagged = true;
    return board;
};

describe('round trip', () => {
    test('every cell state survives encode and decode', () => {
        const board = everyCellState();

        expect(decodeBoard(encodeBoard(board))).toEqual(board);
    });

    test('every state gets its own character', () => {
        const cells = cellsOf(encodeBoard(everyCellState()));

        expect(cells).toHaveLength(72);
        expect(new Set(cells).size).toBe(72);
    });

    test.each([
        ['a 9x9 board', 9, 9, 10],
        ['a 16x16 board', 16, 16, 40],
        ['the largest board the game allows (32x16)', 32, 16, 105],
    ])('%s comes back the same mid-game', (_label, rows, cols, mines) => {
        const board = midGameBoard(rows, cols, mines);

        expect(decodeBoard(encodeBoard(board))).toEqual(board);
    });

    // Rows and columns swapped would still be the right NUMBER of cells.
    test('a board that is not square keeps its orientation', () => {
        const board = createEmptyBoard(2, 3);
        board[0][2].isMine = true;

        const decoded = decodeBoard(encodeBoard(board));

        expect(decoded).toHaveLength(2);
        expect(decoded[0]).toHaveLength(3);
        expect(decoded[0][2].isMine).toBe(true);
    });

    test('degenerate boards round-trip too', () => {
        expect(decodeBoard(encodeBoard([]))).toEqual([]);
        expect(decodeBoard(encodeBoard([[]]))).toEqual([[]]);
    });

    // Reset copies the shared board to a player's field, and tests compare the strings.
    test('the encoding is canonical: decoding then encoding gives back the same string', () => {
        const encoded = encodeBoard(midGameBoard(16, 16, 40));

        expect(encodeBoard(decodeBoard(encoded))).toBe(encoded);
    });

    // Every move mutates the decoded board in place (revealFrom, toggleFlag, the win's auto-flag).
    test('decoded cells are distinct objects, so changing one leaves the rest alone', () => {
        const board = decodeBoard(encodeBoard(createEmptyBoard(2, 2)));
        board[0][0].isOpen = true;

        expect(board.flat().filter((cell) => cell.isOpen)).toHaveLength(1);
    });

    test('a decoded cell has exactly the four board fields', () => {
        const [[cell]] = decodeBoard(encodeBoard([[{ isMine: true, isOpen: false, isFlagged: true, nearbyMines: 0 }]]));

        expect(Object.keys(cell).sort()).toEqual(['isFlagged', 'isMine', 'isOpen', 'nearbyMines']);
    });
});

describe('the stored string', () => {
    test('leads with its version and dimensions, rows first', () => {
        expect(encodeBoard(createEmptyBoard(2, 3))).toBe('b1:2x3:000000');
    });

    test('is printable ASCII that redis-cli and a JSON log line show verbatim', () => {
        const cells = cellsOf(encodeBoard(everyCellState()));

        expect(cells).toMatch(/^[\x21-\x7e]+$/);
        expect(cells).not.toMatch(/[:"'`\\]/);
    });

    test('a board in play is all alphanumeric', () => {
        // Punctuation is spent only on cells both open and flagged, which only a
        // relaxed room's win makes: its auto-flag covers the mines already detonated.
        expect(cellsOf(encodeBoard(midGameBoard(16, 16, 40)))).toMatch(/^[0-9A-Za-z]+$/);
    });

    test('a 16x16 board is a few hundred bytes, where its JSON was ~17KB', () => {
        const board = midGameBoard(16, 16, 40);
        const bytes = Buffer.byteLength(encodeBoard(board));

        expect(bytes).toBe('b1:16x16:'.length + 256);
        expect(bytes).toBeLessThan(300);
        expect(Buffer.byteLength(JSON.stringify(board)) / bytes).toBeGreaterThan(50);
    });

    test('the largest board, 32x16, is one byte a cell plus the header', () => {
        expect(Buffer.byteLength(encodeBoard(midGameBoard(32, 16, 105)))).toBe('b1:32x16:'.length + 512);
    });
});

describe('legacy JSON', () => {
    test('a board stored as JSON before the encoding decodes to the same board', () => {
        const board = everyCellState();

        expect(decodeBoard(JSON.stringify(board))).toEqual(board);
    });

    test('writing a decoded legacy board back stores the new format', () => {
        const board = midGameBoard(9, 9, 10);
        const upgraded = encodeBoard(decodeBoard(JSON.stringify(board)));

        expect(upgraded.startsWith('b1:9x9:')).toBe(true);
        expect(decodeBoard(upgraded)).toEqual(board);
    });
});

describe('decodeBoard', () => {
    // '' is how a PVP room marks a board not dealt yet.
    test.each([[null], [undefined], ['']])('reads %p as no board', (raw) => {
        expect(decodeBoard(raw)).toBeNull();
    });

    test.each([
        ['an unknown version', 'b9:1x1:0'],
        ['no header at all', '0000'],
        ['malformed dimensions', 'b1:2by2:0000'],
        ['too few cells for its dimensions', 'b1:2x2:000'],
        ['too many cells for its dimensions', 'b1:1x1:00'],
        ['a character outside the alphabet', 'b1:1x2:0~'],
        ['a character outside ASCII', 'b1:1x1:é'],
        ['truncated legacy JSON', '[[{"isMine":'],
    ])('throws on %s rather than returning a different board', (_label, raw) => {
        expect(() => decodeBoard(raw)).toThrow();
    });

    test('throws on a value that is not a string', () => {
        expect(() => decodeBoard([[]])).toThrow(TypeError);
    });
});

describe('encodeBoard', () => {
    const cell = (extra = {}) => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0, ...extra });

    test.each([
        ['something that is not an array', {}],
        ['rows of different lengths', [[cell(), cell()], [cell()]]],
        ['a row that is not an array', [[cell()], null]],
        ['a missing cell', [[cell(), null]]],
        ['nearbyMines above 8', [[cell({ nearbyMines: 9 })]]],
        ['negative nearbyMines', [[cell({ nearbyMines: -1 })]]],
        ['fractional nearbyMines', [[cell({ nearbyMines: 1.5 })]]],
        ['no nearbyMines at all', [[{ isMine: false, isOpen: false, isFlagged: false }]]],
    ])('refuses %s rather than storing a board it cannot read back', (_label, board) => {
        expect(() => encodeBoard(board)).toThrow();
    });
});
