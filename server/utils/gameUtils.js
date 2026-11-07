const { resetPlayerScores, updatePlayerStatsInRoom } = require('./playerUtils');
const { io } = require('./initializeClient');
const { recordForSockets } = require('./statsRecorder');
const roomRepo = require('../data/roomRepo');
const { stoppedAt } = require('../domain/clock');
const { createEmptyBoard, projectBoard } = require('../domain/board');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * Every room field `checkWin` reads off the state it is handed. A caller that
 * already holds the board fetches these (`roomRepo.getFields`) rather than the
 * whole hash, which would carry that board across the wire again. Reading a
 * new field below means adding it here, or it arrives undefined.
 */
const CHECK_WIN_FIELDS = ['gameOver', 'gameWon', 'players', 'startedAt', 'relaxed'];

/**
 * Won iff every non-mine cell is open. Resolves true only when THIS call
 * recorded the win, so a caller still holding the pre-win `roomState` knows
 * not to emit a running clock or a hidden board after the final ones.
 */
const checkWin = async (roomState, board, room) => {
    if (!roomState || roomState.gameOver === 'true' || roomState.gameWon === 'true') {
        return false;
    }

    const allNonMinesOpened = board.every((row) =>
        row.every((cell) => cell.isMine || cell.isOpen)
    );

    if (allNonMinesOpened) {
        // Re-read: two moves that both finish the board would otherwise both emit.
        const currentState = await roomRepo.getField(room, 'gameWon');
        if (currentState === 'true') {
            return false;
        }

        // Auto-flag the remaining mines for a clean visual completion.
        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[r].length; c++) {
                if (board[r][c].isMine) {
                    board[r][c].isFlagged = true;
                }
            }
        }

        const endedAt = Date.now();
        await roomRepo.setBoard(room, board, {
            gameWon: 'true',
            endedAt: endedAt.toString()
        });

        // Terminal state: the game is won, so the full layout can be shown.
        io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, projectBoard(board, { revealMines: true }));
        io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, stoppedAt(roomState, endedAt));
        io.to(room).emit(SERVER_EVENTS.GAME_WON);

        // Server-authoritative stats, fire-and-forget: a stats hiccup must never delay the win.
        try {
            const players = JSON.parse(roomState.players || '[]');
            const startedAt = parseInt(roomState.startedAt, 10);
            recordForSockets(players, {
                mode: 'co-op',
                relaxed: roomState.relaxed === 'true',
                board,
                won: true,
                durationMs: Number.isFinite(startedAt) ? endedAt - startedAt : null,
                players: players.length,
                finishedAt: endedAt,
            });
        } catch (error) {
            console.error('Stats write dropped:', error.message);
        }
        return true;
    }
    return false;
};

/** Every Redis value is a string; see ARCHITECTURE.md for the full room schema. */
const createRoom = async (room, numRows, numCols, numMines, mode = 'co-op', noGuess = true, relaxed = false) => {
    const roomData = {
        mode: mode,
        relaxed: mode === 'co-op' && relaxed === true ? 'true' : 'false',
        livesRemaining: mode === 'co-op' && relaxed === true ? '3' : '1',
        noGuess: noGuess !== false ? 'true' : 'false',
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
        players: JSON.stringify([]),
        numRows: numRows.toString(),
        numCols: numCols.toString(),
        numMines: numMines.toString()
    };

    // Co-op's board rides the creating write; PVP's are dealt when the race starts.
    const board = mode === 'co-op' ? createEmptyBoard(numRows, numCols) : null;
    if (mode === 'pvp') {
        roomData.pvpStarted = 'false';
        roomData.hostSocket = ''; // the first player to join
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
        roomData.player1Progress = '0'; // cells revealed
        roomData.player2Progress = '0';
        roomData.totalSafeCells = '0'; // set when the game starts
        roomData.winnerSocket = '';
    }

    await roomRepo.create(room, roomData, board);
}

/**
 * Wipes the room back to an unplayed board. Holds the room's action lock, or
 * a move in flight writes its board over the fresh one and the room claims
 * `initialized: 'false'` on a played board. Not reentrant.
 */
const resetGame = async (room) => roomRepo.withActionLock(room, 'reset', async () => {
    const roomState = await roomRepo.getState(room);
    if (!roomState) return;

    const numRows = parseInt(roomState.numRows, 10);
    const numCols = parseInt(roomState.numCols, 10);
    const newBoard = createEmptyBoard(numRows, numCols);

    io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, newBoard);
    io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt: null, endedAt: null });
    io.to(room).emit(SERVER_EVENTS.RESET_EVERYONE);

    await roomRepo.setBoard(room, newBoard, {
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
        startedAt: '',
        endedAt: '',
        gameOverName: '',
        livesRemaining: roomState.relaxed === 'true' ? '3' : '1',
    });

    io.to(room).emit(SERVER_EVENTS.COOP_LIVES, { room, relaxed: roomState.relaxed === 'true',
        livesRemaining: roomState.relaxed === 'true' ? 3 : 1 });

    await Promise.all([
        resetPlayerScores(room),
        updatePlayerStatsInRoom(room),
    ]);
});
module.exports = { checkWin, CHECK_WIN_FIELDS, createRoom, resetGame };
