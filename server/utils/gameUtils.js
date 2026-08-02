const { resetPlayerScores, updatePlayerStatsInRoom } = require('./playerUtils');
const { generateBoard } = require('../domain/boardGen');
const { io } = require('./initializeClient');
const roomRepo = require('../data/roomRepo');
const { stoppedAt } = require('../domain/clock');
const { createEmptyBoard, projectBoard } = require('../domain/board');
const { SERVER_EVENTS } = require('../../shared/events');

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

/**
 * Wipes the room back to an unplayed board.
 *
 * Holds the room's action lock, because this is a co-op board write like any
 * other. A move already in flight would otherwise write its board back on top of
 * the fresh one, leaving a room that claims `initialized: 'false'` while holding
 * a played board — and the next click would then generate a second board over
 * it. Which of the two lands first is genuinely ambiguous; that either is
 * complete when the other starts is not.
 *
 * The lock is not reentrant, so nothing that already holds it may call this.
 * Today the only caller is the RESET_GAME handler in server.js.
 */
const resetGame = async (room) => roomRepo.withActionLock(room, 'reset', async () => {
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
});
module.exports = { checkWin, createRoom, resetGame };
