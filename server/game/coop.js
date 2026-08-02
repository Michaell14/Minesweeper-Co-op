/**
 * Co-op mode: every player in the room shares one board.
 *
 * Cell actions are broadcast to the whole room. Room state is fetched by
 * game/index.js and passed in, so nothing here re-reads it on entry.
 *
 * Every function here reads the board, mutates it and writes all of it back, so
 * none of them is safe to run concurrently for one room. game/index.js holds the
 * room's action lock across the call and reads the snapshot it passes in under
 * that lock; do not call into this module without it.
 */

const { generateBoard } = require('../domain/boardGen');
const { checkWin } = require('../utils/gameUtils');
const { updatePlayerStatsInRoom } = require('../utils/playerUtils');
const { getAdjacentCells, revealFrom, projectBoard, projectCells } = require('../domain/board');
const { clockOf, readStamp } = require('../domain/clock');
const { io } = require('../utils/initializeClient');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * Reveals cells from (r, c) and returns how many SAFE cells were opened, which
 * is what the player scores. Hitting a mine ends the game for the WHOLE room and
 * records who did it, which is the only way this differs from the PVP version.
 */
const reveal = async (board, r, c, room, socketId, toUpdate) => {
    const { hitMine, cellsRevealed } = revealFrom(board, r, c, toUpdate);
    if (!hitMine) return cellsRevealed;

    const gameOverName = await playerRepo.getName(socketId);
    const endedAt = Date.now();
    // The clock goes first: the loss opens the end-of-game summary, which reads
    // the final time.
    const startedAt = readStamp(await roomRepo.getField(room, 'startedAt'));
    io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt, endedAt });
    io.to(room).emit(SERVER_EVENTS.GAME_OVER, gameOverName);
    await roomRepo.setFields(room, {
        gameOver: 'true',
        gameOverName: gameOverName || 'Unknown',
        endedAt: endedAt.toString()
    });

    // Required: clients are not given mine positions up front, so without this
    // the board would show a single detonated mine and nothing else.
    io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, projectBoard(board, { revealMines: true }));
    return cellsRevealed;
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
                // The clock starts on the first reveal, not on room creation:
                // a room can sit open for minutes before anyone clicks.
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
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                const currentState = await roomRepo.getField(room, 'initialized');
                if (currentState === 'true') {
                    board = await roomRepo.getBoard(room);
                    break;
                }
            }
        }
    }

    const toUpdate = [];
    const cellsRevealed = await reveal(board, row, col, room, socketId, toUpdate);

    // One point per safe cell opened, cascades included — the same rule PVP
    // uses. Scoring per click instead undercounted the player who triggered a
    // large cascade, and disagreed with chording, which already scored per cell.
    if (cellsRevealed > 0) {
        const currentScore = parseInt(playerScore || '0', 10) || 0;
        await playerRepo.setScore(socketId, currentScore + cellsRevealed);
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
                scoreIncrement += await reveal(board, adj.row, adj.col, room, socketId, toUpdate);
            }
        }
    }

    if (scoreIncrement > 0) {
        const currentScore = await playerRepo.getScore(socketId);
        await playerRepo.setScore(socketId, currentScore + scoreIncrement);
    }

    await updatePlayerStatsInRoom(room);
    await roomRepo.setBoard(room, board);
    // Re-read: revealing may have just ended the game, and the snapshot this
    // was called with predates that. Passing the stale one lets a chord that
    // detonates a mine also report a win.
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

    // The flagged cell is still CLOSED, so this projection is what stopped a
    // flag toggle from leaking that cell's mine status.
    io.to(room).emit(SERVER_EVENTS.UPDATE_CELLS, projectCells(toUpdate));
    await roomRepo.setBoard(room, board);
    await checkWin(await roomRepo.getState(room), board, room);
};

module.exports = { openCell, chordCell, toggleFlag };
