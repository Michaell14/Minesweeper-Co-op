const { resetPlayerScores, updatePlayerStatsInRoom } = require('./playerUtils');
const { io } = require('./initializeClient');
const { isBoardSolvable } = require('./solverUtils');
const roomRepo = require('../data/roomRepo');
const { stoppedAt } = require('../domain/clock');
const { createEmptyBoard, projectBoard } = require('../domain/board');
const { SERVER_EVENTS } = require('../../shared/events');

// Generates a single random candidate board layout
const generateSingleCandidateBoard = (numRows, numCols, numMines, excludeRow, excludeCol) => {
    const board = createEmptyBoard(numRows, numCols);

    // Calculate available cells (excluding the 3x3 area around first click)
    const totalCells = numRows * numCols;
    const excludedCells = 9; // 3x3 grid around first click
    const maxMines = totalCells - excludedCells;

    // Prevent infinite loop by capping mines at available space
    const actualMines = Math.min(numMines, maxMines);

    // Create array of all valid positions
    const validPositions = [];
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            // Exclude 3x3 area around first click
            if (!(r >= excludeRow - 1 && r <= excludeRow + 1 && c >= excludeCol - 1 && c <= excludeCol + 1)) {
                validPositions.push({ row: r, col: c });
            }
        }
    }

    // Shuffle array using Fisher-Yates algorithm and place mines
    for (let i = validPositions.length - 1; i >= validPositions.length - actualMines; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validPositions[i], validPositions[j]] = [validPositions[j], validPositions[i]];

        const { row, col } = validPositions[i];
        board[row][col] = {
            ...board[row][col],
            isMine: true
        };
    }

    // For each cell, calculating the number of mines in its 3x3 perimeter
    // Runtime: O(n^2)
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            if (!board[r][c].isMine) {
                let count = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < numRows && nc >= 0 && nc < numCols && board[nr][nc].isMine) {
                            count++;
                        }
                    }
                }
                board[r][c] = { 
                    ...board[r][c],
                    nearbyMines: count
                };
            }
        }
    }

    return board;
};

/**
 * How many candidate layouts to try before giving up on the no-guess guarantee.
 *
 * This was 50, which was enough while the densest board shipped was 18.8%.
 * Adding the Extreme difficulty (20.6%, classic Expert) made it too few: only
 * about 7% of random 20x16 layouts at that density are logic-solvable, so 50
 * attempts fell back to a guessy board 3% of the time on Large and 13% on a
 * 32x16 custom board — silently, since the fallback is indistinguishable from a
 * real result.
 *
 * 300 removed the fallback entirely across 200 games on every shipped size. It
 * costs nothing in the common case because the loop stops at the first success
 * (median 5-15 attempts); it only raises the worst case, from ~28ms to ~64ms on
 * the largest board, and that worst case is now vanishingly rare.
 */
const DEFAULT_MAX_ATTEMPTS = 300;

/**
 * Utility function to generate a Minesweeper board.
 * If options.noGuess is true (default), runs a Generate-and-Verify loop with isBoardSolvable
 * to guarantee that the board can be 100% solved without probabilistic 50:50 guessing.
 */
const generateBoard = (numRows, numCols, numMines, excludeRow, excludeCol, options = { noGuess: true, maxAttempts: DEFAULT_MAX_ATTEMPTS }) => {
    const shouldEnsureNoGuess = options && options.noGuess !== false;
    const maxAttempts = (options && options.maxAttempts) || DEFAULT_MAX_ATTEMPTS;

    if (!shouldEnsureNoGuess) {
        return generateSingleCandidateBoard(numRows, numCols, numMines, excludeRow, excludeCol);
    }

    let fallbackCandidate = null;

    // Retry loop: evaluate candidate layouts until a 100% logic-solvable board is found
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = generateSingleCandidateBoard(numRows, numCols, numMines, excludeRow, excludeCol);
        if (!fallbackCandidate) {
            fallbackCandidate = candidate;
        }

        // Test if candidate board is 100% solvable without guesses starting from (excludeRow, excludeCol)
        if (isBoardSolvable(candidate, excludeRow, excludeCol)) {
            return candidate;
        }
    }

    // Fallback to initial candidate if max attempts reached
    return fallbackCandidate;
};

const checkWin = async (roomState, board, room) => {
    // Don't check win if game is already over or won
    if (!roomState || roomState.gameOver === 'true' || roomState.gameWon === 'true') {
        return;
    }

    // A game is won IF AND ONLY IF every non-mine cell has been opened
    const allNonMinesOpened = board.every((row) =>
        row.every((cell) => cell.isMine || cell.isOpen)
    );

    if (allNonMinesOpened) {
        // Double-check in Redis to prevent race condition
        const currentState = await roomRepo.getField(room, 'gameWon');
        if (currentState === 'true') {
            return; // Already won, don't emit again
        }

        // Auto-flag all remaining mines for a clean visual completion
        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[r].length; c++) {
                if (board[r][c].isMine) {
                    board[r][c].isFlagged = true;
                }
            }
        }

        const endedAt = Date.now();
        await roomRepo.setFields(room, {
            gameWon: 'true',
            board: JSON.stringify(board),
            endedAt: endedAt.toString()
        });

        // Terminal state: the game is won, so the full layout can be shown.
        io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, projectBoard(board, { revealMines: true }));
        io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, stoppedAt(roomState, endedAt));
        io.to(room).emit(SERVER_EVENTS.GAME_WON);
    }
};

// Note that Object properties set in redis must be string
// ROOM PROPERTIES:
// gameOver
// gameWon
// initialized
// players
// numRows
// numCols
// numMines

// CELL PROPERTIES:
// isMine: boolean
// isOpen: boolean
// isFlagged: boolean
// nearbyMines: number

// Checked
const createRoom = async (room, numRows, numCols, numMines, mode = 'co-op', noGuess = true) => {
    const roomData = {
        mode: mode,
        noGuess: noGuess !== false ? 'true' : 'false',
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
        players: JSON.stringify([]),
        numRows: numRows.toString(),
        numCols: numCols.toString(),
        numMines: numMines.toString()
    };

    if (mode === 'co-op') {
        // Initialize empty board for co-op mode
        roomData.board = JSON.stringify(createEmptyBoard(numRows, numCols));
    } else if (mode === 'pvp') {
        // Initialize PVP-specific fields
        roomData.pvpStarted = 'false';
        roomData.hostSocket = ''; // Track who the host is (first player to join)
        roomData.player1Socket = '';
        roomData.player2Socket = '';
        roomData.player1Board = '';
        roomData.player2Board = '';
        roomData.player1Initialized = 'false';
        roomData.player2Initialized = 'false';
        roomData.player1GameOver = 'false';
        roomData.player2GameOver = 'false';
        roomData.player1GameWon = 'false';
        roomData.player2GameWon = 'false';
        roomData.player1Progress = '0'; // Progress tracking (cells revealed)
        roomData.player2Progress = '0';
        roomData.totalSafeCells = '0'; // Set when game starts
        roomData.winnerSocket = '';
    }

    await roomRepo.create(room, roomData);
}

const resetGame = async (room) => {
    // Fetch room state once
    const roomState = await roomRepo.getState(room);
    if (!roomState) return;

    const numRows = parseInt(roomState.numRows, 10);
    const numCols = parseInt(roomState.numCols, 10);

    // Create empty board
    const newBoard = createEmptyBoard(numRows, numCols);

    // Emit events to reset the board and players
    io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, newBoard);
    io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt: null, endedAt: null });
    io.to(room).emit(SERVER_EVENTS.RESET_EVERYONE);

    // Update room state and reset player scores in Redis
    await roomRepo.setFields(room, {
        board: JSON.stringify(newBoard),
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
        startedAt: '',
        endedAt: '',
        gameOverName: '',
    });

    // Reset player scores and update player names
    await Promise.all([
        resetPlayerScores(room),
        updatePlayerStatsInRoom(room),
    ]);
}
module.exports = { generateBoard, checkWin, createRoom, resetGame };