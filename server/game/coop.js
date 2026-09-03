/**
 * Co-op mode: every player in the room shares one board, and cell actions are
 * broadcast to the room. Every function reads the board, mutates it and writes
 * all of it back, so game/index.js holds the room's action lock across the
 * call and reads the snapshot it passes in under that lock; do not call in
 * without it.
 */

const { generateBoard } = require('../domain/boardGen');
const { checkWin } = require('../utils/gameUtils');
const { updatePlayerStatsInRoom } = require('../utils/playerUtils');
const { getAdjacentCells, revealFrom, projectBoard, projectCells } = require('../domain/board');
const { clockOf, readStamp } = require('../domain/clock');
const { io } = require('../utils/initializeClient');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { recordForSockets } = require('../utils/statsRecorder');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * Reveals from (r, c) and returns how many SAFE cells opened (the score), or
 * -1 for a mine, which ends the game for the WHOLE room and records who did it.
 * The -1 is what stops a chord's loop revealing on after the game has ended.
 */
const reveal = async (board, r, c, room, socketId, toUpdate) => {
    const { hitMine, cellsRevealed } = revealFrom(board, r, c, toUpdate);
    if (!hitMine) return cellsRevealed;

    const gameOverName = await playerRepo.getName(socketId);
    const endedAt = Date.now();
    // The clock goes first: the loss opens the summary, which reads the final time.
    const startedAt = readStamp(await roomRepo.getField(room, 'startedAt'));
    io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt, endedAt });
    io.to(room).emit(SERVER_EVENTS.GAME_OVER, gameOverName);
    await roomRepo.setFields(room, {
        gameOver: 'true',
        gameOverName: gameOverName || 'Unknown',
        endedAt: endedAt.toString()
    });

    // Clients have no mine positions up front; without this only the detonated mine shows.
    io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, projectBoard(board, { revealMines: true }));

    // The loss, for every signed-in player's stats. Fire-and-forget.
    try {
        const players = JSON.parse((await roomRepo.getField(room, 'players')) || '[]');
        recordForSockets(players, {
            mode: 'co-op',
            board,
            won: false,
            durationMs: Number.isFinite(startedAt) ? endedAt - startedAt : null,
            players: players.length,
            finishedAt: endedAt,
        });
    } catch (error) {
        console.error('Stats write dropped:', error.message);
    }
    return -1;
};

const openCell = async (row, col, room, socketId, roomState, playerScore) => {
    if (roomState.gameOver === 'true' || roomState.gameWon === 'true') {
        return;
    }

    let board = JSON.parse(roomState.board);

    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;
    if (
        board[row][col] === undefined ||
        !board[row][col] ||
        board[row][col].isOpen ||
        board[row][col].isFlagged
    ) return;

    const numRows = parseInt(roomState.numRows, 10);
    const numCols = parseInt(roomState.numCols, 10);
    const numMines = parseInt(roomState.numMines, 10);
    let justInitialized = false;

    // First reveal generates the board. The init lock predates the room action
    // lock this call already runs under and is kept as a second line of defence.
    if (roomState.initialized === 'false') {
        const lockAcquired = await roomRepo.acquireInitLock(room, socketId);

        if (lockAcquired) {
            const freshState = await roomRepo.getField(room, 'initialized');
            if (freshState === 'true') {
                // Someone else generated it while we waited for the lock.
                await roomRepo.releaseInitLock(room);
                board = await roomRepo.getBoard(room);
            } else {
                const shouldNoGuess = roomState.noGuess !== 'false';
                board = generateBoard(numRows, numCols, numMines, row, col, { noGuess: shouldNoGuess });
                // The clock starts on the first reveal: a room can sit open for minutes first.
                await roomRepo.setFields(room, {
                    initialized: 'true',
                    board: JSON.stringify(board),
                    startedAt: Date.now().toString()
                });
                await roomRepo.releaseInitLock(room);
                justInitialized = true;
            }
        } else {
            // Someone else holds it: poll briefly for their board.
            let generated = false;
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                const currentState = await roomRepo.getField(room, 'initialized');
                if (currentState === 'true') {
                    board = await roomRepo.getBoard(room);
                    generated = true;
                    break;
                }
            }

            /*
             * Give up on the CLICK, not the board: `board` is still the empty
             * grid, and revealing from it would cascade the whole thing open
             * over the layout the lock holder is generating.
             */
            if (!generated) {
                console.error(`[coop] board for ${room} was never initialised; dropping the move`);
                return;
            }
        }
    }

    const toUpdate = [];
    const safeCellsRevealed = await reveal(board, row, col, room, socketId, toUpdate);

    // One point per safe cell opened, cascades included, the same rule PVP
    // uses (server/tests/scoringParity.test.js). A detonation (-1) scores nothing.
    if (safeCellsRevealed > 0) {
        const currentScore = parseInt(playerScore || '0', 10) || 0;
        await playerRepo.setScore(socketId, currentScore + safeCellsRevealed);
        await updatePlayerStatsInRoom(room);
    }

    await roomRepo.setBoard(room, board);

    // Re-read: `reveal` may have just ended the game.
    const freshRoomState = await roomRepo.getState(room);
    await checkWin(freshRoomState, board, room);

    const isOver = freshRoomState.gameOver === 'true' || freshRoomState.gameWon === 'true';

    if (justInitialized) {
        io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, clockOf(freshRoomState));
        io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, projectBoard(board, { revealMines: isOver }));
    } else {
        io.to(room).emit(SERVER_EVENTS.UPDATE_CELLS, projectCells(toUpdate, { revealMines: isOver }));
    }
};

const chordCell = async (row, col, room, socketId, roomState) => {
    if (roomState === undefined || !roomState || roomState.gameOver === 'true' || roomState.gameWon === 'true') {
        return;
    }
    if (roomState.board === undefined || !roomState.board) {
        return;
    }

    const board = JSON.parse(roomState.board);

    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;
    if (!board[row][col].isOpen) return;

    const adjacentCells = getAdjacentCells(row, col, board);
    const flaggedCells = adjacentCells.filter((adj) => adj.isFlagged).length;

    let scoreIncrement = 0;
    const toUpdate = [];

    if (flaggedCells === board[row][col].nearbyMines) {
        for (const adj of adjacentCells) {
            if (!adj.isFlagged && !adj.isOpen) {
                const safeCellsRevealed = await reveal(board, adj.row, adj.col, room, socketId, toUpdate);

                // A chord can uncover more than one mine; `reveal` has already
                // ended the game and sent the whole board, so carrying on would
                // announce a second gameOver and score cells opened after the loss.
                if (safeCellsRevealed === -1) {
                    await roomRepo.setBoard(room, board);
                    return;
                }

                scoreIncrement += safeCellsRevealed;
            }
        }
    }

    if (scoreIncrement > 0) {
        const currentScore = await playerRepo.getScore(socketId);
        await playerRepo.setScore(socketId, currentScore + scoreIncrement);
    }

    await updatePlayerStatsInRoom(room);
    await roomRepo.setBoard(room, board);
    // Re-read: revealing may have just ended the game; the stale snapshot would
    // let a chord that detonates also report a win.
    await checkWin(await roomRepo.getState(room), board, room);
    io.to(room).emit(SERVER_EVENTS.UPDATE_CELLS, projectCells(toUpdate));
};

const toggleFlag = async (row, col, room, socketId, roomState) => {
    if (!roomState || !roomState.board || roomState.gameOver === 'true' || roomState.gameWon === 'true') return;

    const board = JSON.parse(roomState.board);

    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;
    if (board[row][col] === undefined || !board[row][col] || board[row][col].isOpen) return;

    board[row][col].isFlagged = !board[row][col].isFlagged;

    const toUpdate = [{
        ...board[row][col],
        row,
        col,
    }];

    // The flagged cell is still CLOSED; projecting stops the toggle leaking its mine status.
    io.to(room).emit(SERVER_EVENTS.UPDATE_CELLS, projectCells(toUpdate));
    await roomRepo.setBoard(room, board);
    await checkWin(await roomRepo.getState(room), board, room);
};

module.exports = { openCell, chordCell, toggleFlag };
