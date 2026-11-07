/**
 * How a board is STORED in Redis: one character per cell instead of JSON.
 * Pure, like the rest of domain/. Only the repos call it (data/roomRepo,
 * data/dailyRepo), so everything above data/ reads and writes plain arrays.
 *
 * JSON spent ~66 bytes on a cell (`{"isMine":false,...}`): ~17KB for 16x16
 * and ~34KB for 32x16, carried by every read and write of a board, and a PVP
 * room hash holds three. This spends one byte a cell plus a short header.
 * Clients never see it: they receive projected ARRAYS (domain/board.js).
 *
 * v1:  `b1:<rows>x<cols>:<cells>`, the cells row-major, one character each:
 *      ALPHABET[nearbyMines + 9 * (isMine + 2*isOpen + 4*isFlagged)]
 *
 * All 72 combinations are representable, including ones play never produces,
 * so decode(encode(board)) is the same board rather than a tidied one. A new
 * format takes a new prefix, and the decoder keeps reading the old ones.
 *
 * Legacy: a string starting with `[` is the JSON this replaced. Rooms live
 * 24h and daily attempts 48h, so boards written before the deploy are still
 * being played; the first move on one writes it back as v1.
 */

const PREFIX = 'b1:';
const HEADER = new RegExp(`^${PREFIX}(\\d+)x(\\d+):`);

/**
 * Code -> character. Printable ASCII with no `:` (the header's delimiter), no
 * quote, backslash or space, so a stored board reads verbatim in redis-cli
 * and in a JSON log line. Ordered so a board in play is all alphanumeric.
 */
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-';

/** nearbyMines runs 0-8, so each combination of the three flags owns nine codes. */
const COUNTS = 9;
const MINE = 1;
const OPEN = 2;
const FLAGGED = 4;

/** charCode -> code; -1 for anything outside the alphabet. */
const CODE_OF = new Int8Array(128).fill(-1);
for (let code = 0; code < ALPHABET.length; code++) CODE_OF[ALPHABET.charCodeAt(code)] = code;

const encodeCell = (cell, r, c) => {
    if (!cell || typeof cell !== 'object') {
        throw new TypeError(`encodeBoard: cell ${r},${c} is not a cell`);
    }
    const n = cell.nearbyMines;
    if (!Number.isInteger(n) || n < 0 || n >= COUNTS) {
        throw new RangeError(`encodeBoard: cell ${r},${c} has nearbyMines ${n}, outside 0-8`);
    }
    const flags = (cell.isMine ? MINE : 0) | (cell.isOpen ? OPEN : 0) | (cell.isFlagged ? FLAGGED : 0);
    return ALPHABET[n + COUNTS * flags];
};

/**
 * A board array as the string the repos store. Throws on anything that is not
 * a rectangular grid of cells: a malformed board is a bug upstream, and it is
 * easier to find at the write than as a corrupt read on a later move.
 */
const encodeBoard = (board) => {
    if (!Array.isArray(board)) throw new TypeError('encodeBoard: expected an array of rows');

    const rows = board.length;
    const cols = Array.isArray(board[0]) ? board[0].length : 0;
    let cells = '';
    for (let r = 0; r < rows; r++) {
        const row = board[r];
        if (!Array.isArray(row) || row.length !== cols) {
            throw new TypeError(`encodeBoard: row ${r} is not ${cols} cells long; a board is rectangular`);
        }
        for (let c = 0; c < cols; c++) cells += encodeCell(row[c], r, c);
    }
    return `${PREFIX}${rows}x${cols}:${cells}`;
};

const decodeCell = (raw, index) => {
    const charCode = raw.charCodeAt(index);
    const code = charCode < CODE_OF.length ? CODE_OF[charCode] : -1;
    if (code === -1) throw new SyntaxError(`decodeBoard: "${raw[index]}" at offset ${index} is not a cell`);

    const flags = Math.floor(code / COUNTS);
    return {
        isMine: (flags & MINE) !== 0,
        isOpen: (flags & OPEN) !== 0,
        isFlagged: (flags & FLAGGED) !== 0,
        nearbyMines: code % COUNTS,
    };
};

/**
 * A stored board back to an array of fresh cell objects, or null when there
 * is none ('' is how a PVP room marks a board not dealt yet). Reads v1 and the
 * legacy JSON; anything else throws, as JSON.parse did on a corrupt board.
 */
const decodeBoard = (raw) => {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw !== 'string') throw new TypeError('decodeBoard: expected a string');
    // Keep: a join refreshes a room's expiry, so JSON boards have no end date (CLAUDE.md trap 13).
    if (raw.startsWith('[')) return JSON.parse(raw);

    const header = HEADER.exec(raw);
    if (!header) throw new SyntaxError(`decodeBoard: unrecognised board encoding "${raw.slice(0, 12)}"`);

    const rows = Number(header[1]);
    const cols = Number(header[2]);
    const start = header[0].length;
    if (raw.length - start !== rows * cols) {
        throw new SyntaxError(`decodeBoard: a ${rows}x${cols} board needs ${rows * cols} cells, found ${raw.length - start}`);
    }

    return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => decodeCell(raw, start + r * cols + c)));
};

module.exports = { encodeBoard, decodeBoard };
