/**
 * Co-op mode: every player in the room shares one board.
 *
 * Cell actions are broadcast to the whole room. Room state is fetched once by
 * game/index.js and passed in, so nothing here re-reads it on entry.
 */

const { generateBoard, checkWin } = require('../utils/gameUtils');
const { updatePlayerStatsInRoom } = require('../utils/playerUtils');
const { getAdjacentCells } = require('../domain/board');
const { io } = require('../utils/initializeClient');
const { redisClient } = require('../utils/initializeRedisClient');

// Reveals a cell to player
const reveal = async (board, r, c, room, socketId, toUpdate) => {
    const client = await redisClient;
    const stack = [[r, c]];

    // Iteratively reveals open cells
    while (stack.length > 0) {
        const [row, col] = stack.pop();

        if (row < 0 || row >= board.length || col < 0 || col >= board[0].length || board[row][col].isOpen || board[row][col].isFlagged) continue;

        board[row][col].isOpen = true;
        toUpdate.push({
            ...board[row][col],
            row: row,
            col: col,
        });

        if (board[row][col].isMine) {
            const gameOverName = await client.hGet(`player:${socketId}`, "name");
            io.to(room).emit('gameOver', gameOverName);
            await client.hSet(`room:${room}`, {
                gameOver: 'true',
                gameOverName: gameOverName || 'Unknown'
            });
            return;
        }

        if (board[row][col].nearbyMines === 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    stack.push([row + dr, col + dc]);
                }
            }
        }
    }
};

// Opens a cell
const openCell = async (row, col, room, socketId, roomState, playerScore) => {
    const client = await redisClient;

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
        const initLockKey = `init_lock:${room}`;
        const lockAcquired = await client.set(initLockKey, socketId, {
            NX: true, // Only set if doesn't exist
            EX: 10    // Expire after 10 seconds (timeout protection)
        });

        if (lockAcquired) {
            // Double-check after acquiring lock to prevent race condition
            const freshState = await client.hGet(`room:${room}`, 'initialized');
            if (freshState === 'true') {
                // Someone else initialized while we were waiting for the lock
                await client.del(initLockKey);
                const updatedBoard = await client.hGet(`room:${room}`, 'board');
                board = JSON.parse(updatedBoard);
            } else {
                // We can safely initialize
                const shouldNoGuess = roomState.noGuess !== 'false';
                board = generateBoard(numRows, numCols, numMines, row, col, { noGuess: shouldNoGuess });
                await client.hSet(`room:${room}`, {
                    initialized: 'true',
                    board: JSON.stringify(board)
                });
                await client.del(initLockKey); // Release lock
                justInitialized = true;
            }
        } else {
            // Another player is initializing, wait and reload
            // Poll for completion (max 5 attempts with 100ms delay)
            for (let i = 0; i < 5; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                const currentState = await client.hGet(`room:${room}`, 'initialized');
                if (currentState === 'true') {
                    const updatedBoard = await client.hGet(`room:${room}`, 'board');
                    board = JSON.parse(updatedBoard);
                    break;
                }
            }
            // Don't award score for this click since we didn't initialize
        }
    } else if (!board[row][col].isMine) {
        // Update player score in a single database operation
        const currentScore = parseInt(playerScore || '0', 10) || 0;
        const newScore = currentScore + 1;
        await client.hSet(`player:${socketId}`, { score: newScore.toString() });
        await updatePlayerStatsInRoom(room);
    }

    // Reveal cells and update board state
    const toUpdate = [];
    await reveal(board, row, col, room, socketId, toUpdate);

    // Save board first before checking win condition
    await client.hSet(`room:${room}`, { board: JSON.stringify(board) });

    // Refresh room state to get latest gameOver/gameWon status before checking win
    const freshRoomState = await client.hGetAll(`room:${room}`);
    await checkWin(freshRoomState, board, room);

    if (justInitialized) {
        io.to(room).emit("boardUpdate", board);
    } else {
        io.to(room).emit('updateCells', toUpdate);
    }
};

const chordCell = async (row, col, room, socketId, roomState) => {
    const client = await redisClient;

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
        const playerScore = await client.hGet(`player:${socketId}`, 'score');
        const currentScore = parseInt(playerScore || '0', 10) || 0;
        const newScore = currentScore + scoreIncrement;
        await client.hSet(`player:${socketId}`, { score: newScore.toString() });
    }

    await updatePlayerStatsInRoom(room);
    await client.hSet(`room:${room}`, { board: JSON.stringify(board) });
    await checkWin(roomState, board, room);
    io.to(room).emit("updateCells", toUpdate);
};

const toggleFlag = async (row, col, room, socketId, roomState) => {
    const client = await redisClient;

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

    // Emit the cell update and update the board in Redis
    io.to(room).emit('updateCells', toUpdate);
    await client.hSet(`room:${room}`, { board: JSON.stringify(board) });
    await checkWin(roomState, board, room);
};

module.exports = { reveal, openCell, chordCell, toggleFlag };
