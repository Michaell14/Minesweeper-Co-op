/**
 * Co-op mode: every player in the room shares one board.
 *
 * Cell actions are broadcast to the whole room. Room state is fetched once by
 * game/index.js and passed in, so nothing here re-reads it on entry.
 */

const { generateBoard, checkWin } = require('../utils/gameUtils');
const { updatePlayerStatsInRoom } = require('../utils/playerUtils');
const { getAdjacentCells, revealFrom, projectBoard, projectCells } = require('../domain/board');
const { io } = require('../utils/initializeClient');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * Reveals cells from (r, c). Hitting a mine ends the game for the WHOLE room and
 * records who did it, which is the only way this differs from the PVP version.
 */
const reveal = async (board, r, c, room, socketId, toUpdate) => {
    const { hitMine } = revealFrom(board, r, c, toUpdate);
    if (!hitMine) return;

    const gameOverName = await playerRepo.getName(socketId);
    io.to(room).emit(SERVER_EVENTS.GAME_OVER, gameOverName);
    await roomRepo.setFields(room, {
        gameOver: 'true',
        gameOverName: gameOverName || 'Unknown'
    });

    // The game is over, so every mine becomes visible. This send is required:
    // clients are no longer given mine positions up front, so without it the
    // board would show a single detonated mine and nothing else.
    io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, projectBoard(board, { revealMines: true }));
};

// Opens a cell
const openCell = async (row, col, room, socketId, roomState, playerScore) => {
    // Return when game is over -> no more interactions necessary
    if (roomState.gameOver === 'true' || roomState.gameWon === 'true') {
        return;
    }

    // Parse board only if necessary
    let board = JSON.parse(roomState.board);

    // Validate bounds first before accessing array
    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;

    // Check invalid scenarios with board state
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

    // Initialize board if not already initialized (with race condition protection)
    if (roomState.initialized === 'false') {
        // Use Redis SET NX: check and set atomically
        // This prevents race condition where two players initialize simultaneously
        const lockAcquired = await roomRepo.acquireInitLock(room, socketId);

        if (lockAcquired) {
            // Double-check after acquiring lock to prevent race condition
            const freshState = await roomRepo.getField(room, 'initialized');
            if (freshState === 'true') {
                // Someone else initialized while we were waiting for the lock
                await roomRepo.releaseInitLock(room);
                board = await roomRepo.getBoard(room);
            } else {
                // We can safely initialize
                const shouldNoGuess = roomState.noGuess !== 'false';
                board = generateBoard(numRows, numCols, numMines, row, col, { noGuess: shouldNoGuess });
                await roomRepo.setFields(room, {
                    initialized: 'true',
                    board: JSON.stringify(board)
                });
                await roomRepo.releaseInitLock(room); // Release lock
                justInitialized = true;
            }
        } else {
            // Another player is initializing, wait and reload
            // Poll for completion (max 5 attempts with 100ms delay)
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                const currentState = await roomRepo.getField(room, 'initialized');
                if (currentState === 'true') {
                    board = await roomRepo.getBoard(room);
                    break;
                }
            }
            // Don't award score for this click since we didn't initialize
        }
    } else if (!board[row][col].isMine) {
        // Update player score in a single database operation
        const currentScore = parseInt(playerScore || '0', 10) || 0;
        await playerRepo.setScore(socketId, currentScore + 1);
        await updatePlayerStatsInRoom(room);
    }

    // Reveal cells and update board state
    const toUpdate = [];
    await reveal(board, row, col, room, socketId, toUpdate);

    // Save board first before checking win condition
    await roomRepo.setBoard(room, board);

    // Refresh room state to get latest gameOver/gameWon status before checking win
    const freshRoomState = await roomRepo.getState(room);
    await checkWin(freshRoomState, board, room);

    const isOver = freshRoomState.gameOver === 'true' || freshRoomState.gameWon === 'true';

    if (justInitialized) {
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
                await reveal(board, adj.row, adj.col, room, socketId, toUpdate);
                if (!adj.isMine) {
                    scoreIncrement++;
                }
            }
        }
    }

    if (scoreIncrement > 0) {
        const currentScore = await playerRepo.getScore(socketId);
        await playerRepo.setScore(socketId, currentScore + scoreIncrement);
    }

    await updatePlayerStatsInRoom(room);
    await roomRepo.setBoard(room, board);
    await checkWin(roomState, board, room);
    io.to(room).emit(SERVER_EVENTS.UPDATE_CELLS, projectCells(toUpdate));
};

const toggleFlag = async (row, col, room, socketId, roomState) => {
    if (!roomState || !roomState.board || roomState.gameOver === 'true' || roomState.gameWon === 'true') return;

    const board = JSON.parse(roomState.board);

    // Validate bounds first before accessing array
    if (!board || !Array.isArray(board) || board.length === 0) return;
    if (row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;

    // Exit early if the cell is already open
    if (board[row][col] === undefined || !board[row][col] || board[row][col].isOpen) return;

    // Toggle the flag
    board[row][col].isFlagged = !board[row][col].isFlagged;

    // Prepare the update for broadcasting
    const toUpdate = [{
        ...board[row][col],
        row,
        col,
    }];

    // Emit the cell update and update the board in Redis.
    // The flagged cell is still CLOSED, so this projection is what stopped a
    // flag toggle from leaking that cell's mine status.
    io.to(room).emit(SERVER_EVENTS.UPDATE_CELLS, projectCells(toUpdate));
    await roomRepo.setBoard(room, board);
    await checkWin(roomState, board, room);
};

module.exports = { reveal, openCell, chordCell, toggleFlag };
