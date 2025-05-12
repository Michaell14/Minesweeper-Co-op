const { addPlayerToRoom } = require('./playerUtils');
const { io } = require('./initializeClient');
const { redisClient } = require('./initializeRedisClient');

// Utility function to generate a board (reusing your board generation logic)
const generateBoard = (numRows, numCols, numMines, excludeRow, excludeCol) => {
    const board = Array(numRows)
        .fill(null)
        .map(() =>
            Array(numCols).fill({
                isMine: false,
                isOpen: false,
                isFlagged: false,
                nearbyMines: 0,
            })
        );

    let placedMines = 0;
    while (placedMines < numMines) {
        const row = Math.floor(Math.random() * numRows);
        const col = Math.floor(Math.random() * numCols);

        if (
            !board[row][col].isMine &&
            !(row >= excludeRow - 1 && row <= excludeRow + 1 && col >= excludeCol - 1 && col <= excludeCol + 1)
        ) {
            board[row][col] = { ...board[row][col], isMine: true };
            placedMines++;
        }
    }

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
                board[r][c] = { ...board[r][c], nearbyMines: count };
            }
        }
    }

    return board;
};

const checkWin = async (roomState, board, room) => {
    if (roomState.gameOver === 'true') {
        return;
    }

    const allNonMinesOpened = board.every((row) =>
        row.every((cell) => (cell.isMine && !cell.isOpen) || (!cell.isMine && cell.isOpen))
    );

    if (allNonMinesOpened) {
        const client = await redisClient;
        await client.hSet(`room:${room}`, { gameWon: 'true' });
        io.to(room).emit('gameWon');
    }
}

const createRoom = async (room, numRows, numCols, numMines, name, socket) => {
    const client = await redisClient;
    const roomExists = await client.exists(`room:${room}`);
    socket.join(`${socket.id}:${room}`);
    // Eventually emit an error
    if (roomExists) {
        io.to(`${socket.id}:${room}`).emit("createRoomError");
        socket.leave(room);
        return;
    }
    socket.leave(`${socket.id}:${room}`);
    socket.join(room);

    await client.hSet(`room:${room}`, {
        // Initialize empty board
        board: JSON.stringify(Array(numRows)
            .fill(null)
            .map(() =>
                Array(numCols).fill({
                    isMine: false,
                    isOpen: false,
                    isFlagged: false,
                    nearbyMines: 0,
                })
            )),
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
        players: JSON.stringify([]),
        numRows: numRows.toString(),
        numCols: numCols.toString(),
        numMines: numMines.toString()
    })

    addPlayerToRoom(room, socket.id, name);
    io.to(room).emit("joinRoomSuccess", room);
}

const joinRoom = async (room, name, socket, io) => {
    const client = await redisClient;
    const roomExists = await client.exists(`room:${room}`);
    socket.join(room);
    // If the room doesn't have a board yet, create one
    if (!roomExists) {
        io.to(room).emit("joinRoomError");
        socket.leave(room);
        return;
    }

    addPlayerToRoom(room, socket.id, name);
    io.to(room).emit("joinRoomSuccess", room);
}
module.exports = { generateBoard, checkWin, createRoom, joinRoom };