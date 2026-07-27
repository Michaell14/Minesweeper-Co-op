/**
 * Board primitives.
 *
 * This module must stay dependency-free (no io, no Redis, no other server
 * modules). It exists to give gameUtils and playerUtils a shared place to get
 * board helpers from without requiring each other — that cycle silently broke
 * resetGame(). See ARCHITECTURE.md §7.
 */

/**
 * Creates a rows x cols grid of closed, unflagged, mine-free cells.
 * Every cell is a distinct object, so mutating one never affects another.
 */
const createEmptyBoard = (numRows, numCols) =>
    Array.from({ length: numRows }, () =>
        Array.from({ length: numCols }, () => ({
            isMine: false,
            isOpen: false,
            isFlagged: false,
            nearbyMines: 0,
        }))
    );

module.exports = { createEmptyBoard };
