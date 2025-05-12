import 'dotenv/config';
import { redisClient } from "./redisClient";
import { io, server } from "./initializeClient";
import { reveal, openCell, getAdjacentCells } from "./utils/boardUtils";
import { createRoom, checkWin } from "./utils/gameUtils";
import type { createRoomType, basicCellType, CellType } from "./utils/types";
import { updatePlayerNamesInRoom, resetPlayerScores, addPlayerToRoom, removePlayer } from "./utils/playerUtils";

// When a new socket connects
io.on('connection', (socket: any) => {
    socket.on('createRoom', async ({ room, numRows, numCols, numMines, name }: createRoomType) => {
        createRoom({ room, numRows, numCols, numMines, name, socket });
    });

    // When a player joins a room
    socket.on('joinRoom', async ({ room, name }: { room: string, name: string }) => {
        const roomExists = await redisClient.exists(`room:${room}`);
        socket.join(room);
        // If the room doesn't have a board yet, create one
        if (!roomExists) {
            io.to(room).emit("joinRoomError");
            socket.leave(room);
            return;
        }

        addPlayerToRoom(room, socket.id, name);
        io.to(room).emit("joinRoomSuccess", room);
    });

    // When a player opens a cell
    socket.on('openCell', async ({ room, row, col }: basicCellType) => {
        const roomExists = await redisClient.exists(`room:${room}`);

        if (!roomExists) {
            return;
        }

        openCell(row, col, room, socket.id);
    });

    socket.on("chordCell", async ({ room, row, col }: basicCellType) => {
        const roomState = await redisClient.hGetAll(`room:${room}`);
        if (roomState === undefined || !roomState || roomState.gameOver === 'true' || roomState.gameWon === 'true') {
            return;
        }
        if (roomState.board === undefined || !roomState.board) {
            return;
        }
        let board = JSON.parse(roomState.board);

        const adjacentCells = getAdjacentCells(row, col, board);
        // Count the number of flagged cells
        const flaggedCells = adjacentCells.filter((adj: CellType) => adj.isFlagged).length;
        let scoreIncrease = 0;
        const toUpdate: CellType[] = [];
        // If the number of flagged cells matches the number on the cell, proceed
        if (flaggedCells === board[row][col].nearbyMines) {
            // Open all adjacent cells that are not flagged and not already open
            adjacentCells.forEach((adj: CellType) => {
                if (!adj.isFlagged && !adj.isOpen) {
                    reveal(board, adj.row, adj.col, room, socket.id, toUpdate);
                    if (!adj.isMine) {
                        scoreIncrease += 1;
                    }
                }
            });
        }

        // Updating player score
        const newScore = parseInt(await redisClient.hGet(`player:${socket.id}`, "score")) + scoreIncrease;
        await redisClient.hSet(`player:${socket.id}`, { score: newScore.toString() })
        updatePlayerNamesInRoom(room);

        checkWin(roomState, board, room);
        io.to(room).emit("updateCells", toUpdate);
        await redisClient.hSet(`room:${room}`, { board: JSON.stringify(board) });
    });

    socket.on('toggleFlag', async ({ room, row, col }: basicCellType) => {
        // Check if room exists and fetch its state in a single call
        const roomState = await redisClient.hGetAll(`room:${room}`);
        if (!roomState || !roomState.board || roomState.gameOver === 'true' || roomState.gameWon === 'true') return;
        
        const board = JSON.parse(roomState.board);
        
        // Exit early if the cell is already open
        if (!board || board[row][col] === undefined || !board[row][col] || board[row][col].isOpen) return;
    
        // Toggle the flag
        board[row][col].isFlagged = !board[row][col].isFlagged;
    
        // Prepare the update for broadcasting
        const toUpdate = [{
            row,
            col,
            ...board[row][col]
        }];
    
        // Emit the cell update and update the board in Redis
        io.to(room).emit('updateCells', toUpdate);
        await redisClient.hSet(`room:${room}`, { board: JSON.stringify(board) });
    });

    socket.on("emitConfetti", async({ room }: { room: string }) => {
        io.to(room).emit("receiveConfetti");
    });

    socket.on('resetGame', async ({ room }: { room: string }) => {
        // Fetch room state once
        const roomState = await redisClient.hGetAll(`room:${room}`);
        if (!roomState) return;
    
        const numRows = parseInt(roomState.numRows, 10);
        const numCols = parseInt(roomState.numCols, 10);
    
        // Create an empty board with a more memory-efficient method
        const newBoard = Array.from({ length: numRows }, () =>
            Array.from({ length: numCols }, () => ({
                isMine: false,
                isOpen: false,
                isFlagged: false,
                nearbyMines: 0,
            }))
        );
    
        // Emit events to reset the board and players
        io.to(room).emit('boardUpdate', newBoard);
        io.to(room).emit('resetEveryone');
    
        // Update room state and reset player scores in Redis
        await redisClient.hSet(`room:${room}`, {
            board: JSON.stringify(newBoard),
            gameOver: 'false',
            gameWon: 'false',
            initialized: 'false',
        });
    
        // Reset player scores and update player names
        await Promise.all([
            resetPlayerScores(room),
            updatePlayerNamesInRoom(room),
        ]);
    });
    
    socket.on("playerLeave", async () => {
        removePlayer(socket, socket.id);
    });

    socket.on('disconnect', async () => {
        removePlayer(socket, socket.id);
    });
}); 