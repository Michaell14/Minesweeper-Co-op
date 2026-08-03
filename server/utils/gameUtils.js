const { resetPlayerScores, updatePlayerStatsInRoom } = require('./playerUtils');
const { io } = require('./initializeClient');
const { recordForSockets, boardKeyOf } = require('./statsRecorder');
const roomRepo = require('../data/roomRepo');
const { stoppedAt } = require('../domain/clock');
const { createEmptyBoard, projectBoard } = require('../domain/board');
const { SERVER_EVENTS } = require('../../shared/events');

/** Won iff every non-mine cell is open. */
const checkWin = async (roomState, board, room) => {
    if (!roomState || roomState.gameOver === 'true' || roomState.gameWon === 'true') {
        return;
    }

    const allNonMinesOpened = board.every((row) =>
        row.every((cell) => cell.isMine || cell.isOpen)
    );

    if (allNonMinesOpened) {
        // Re-read: two moves that both finish the board would otherwise both emit.
        const currentState = await roomRepo.getField(room, 'gameWon');
        if (currentState === 'true') {
            return;
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
        await roomRepo.setFields(room, {
            gameWon: 'true',
            board: JSON.stringify(board),
            endedAt: endedAt.toString()
        });

        // Terminal state: the game is won, so the full layout can be shown.
        io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, projectBoard(board, { revealMines: true }));
        io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, stoppedAt(roomState, endedAt));
        io.to(room).emit(SERVER_EVENTS.GAME_WON);

        // Server-authoritative stats, for every signed-in player in the room.
        // Fire-and-forget: a stats hiccup must never delay the win.
        try {
            const players = JSON.parse(roomState.players || '[]');
            const startedAt = parseInt(roomState.startedAt, 10);
            recordForSockets(players, {
                mode: 'co-op',
                boardKey: boardKeyOf(board),
                won: true,
                durationMs: Number.isFinite(startedAt) ? endedAt - startedAt : null,
                players: players.length,
                finishedAt: endedAt,
            });
        } catch (error) {
            console.error('Stats write dropped:', error.message);
        }
    }
};

/** Every Redis value is a string; see ARCHITECTURE.md for the full room schema. */
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
        roomData.board = JSON.stringify(createEmptyBoard(numRows, numCols));
    } else if (mode === 'pvp') {
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

    await roomRepo.create(room, roomData);
}

/**
 * Wipes the room back to an unplayed board.
 *
 * Holds the room's action lock, because this is a co-op board write like any
 * other. A move already in flight would otherwise write its board back on top of
 * the fresh one, leaving a room that claims `initialized: 'false'` while holding
 * a played board — and the next click would then generate a second board over it.
 *
 * The lock is not reentrant, so nothing that already holds it may call this.
 * Today the only caller is the RESET_GAME handler in server.js.
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

    await roomRepo.setFields(room, {
        board: JSON.stringify(newBoard),
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
        startedAt: '',
        endedAt: '',
        gameOverName: '',
    });

    await Promise.all([
        resetPlayerScores(room),
        updatePlayerStatsInRoom(room),
    ]);
});
module.exports = { checkWin, createRoom, resetGame };
