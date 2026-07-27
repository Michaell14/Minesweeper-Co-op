const { createEmptyBoard } = require('../domain/board');
const { updatePlayerStatsInRoom } = require('../utils/playerUtils');

/**
 * Handles 'startPvpGame' event
 */
const startPvpGame = async ({ socket, room, isValid, client, io }) => {
    try {
        if (!room || typeof room !== 'string') return;
        if (!(await isValid(room))) return;

        const roomState = await client.hGetAll(`room:${room}`);
        const mode = roomState.mode || 'co-op';
        if (mode !== 'pvp') return;

        const players = JSON.parse(roomState.players || '[]');
        if (players.length !== 2) return;

        // Only host can start game
        if (roomState.hostSocket !== socket.id) return;
        if (roomState.pvpStarted === 'true') return;

        const numRows = parseInt(roomState.numRows, 10);
        const numCols = parseInt(roomState.numCols, 10);
        const numMines = parseInt(roomState.numMines, 10);
        const totalSafeCells = (numRows * numCols) - numMines;

        const player1Socket = roomState.hostSocket;
        const player2Socket = players.find(p => p !== player1Socket);
        const emptyBoard = createEmptyBoard(numRows, numCols);

        await client.hSet(`room:${room}`, {
            pvpStarted: 'true',
            totalSafeCells: totalSafeCells.toString(),
            player1Socket,
            player2Socket,
            player1Board: JSON.stringify(emptyBoard),
            player2Board: JSON.stringify(emptyBoard),
            player1Initialized: 'false',
            player2Initialized: 'false',
            player1GameOver: 'false',
            player2GameOver: 'false',
            player1GameWon: 'false',
            player2GameWon: 'false',
            player1Progress: '0',
            player2Progress: '0',
            winnerSocket: '',
        });

        const player1Name = await client.hGet(`player:${player1Socket}`, 'name');
        const player2Name = await client.hGet(`player:${player2Socket}`, 'name');

        await client.hSet(`player:${player1Socket}`, {
            pvpPlayerIndex: '0',
            opponentName: player2Name
        });
        await client.hSet(`player:${player2Socket}`, {
            pvpPlayerIndex: '1',
            opponentName: player1Name
        });

        io.to(room).emit('pvpGameStarted', { totalSafeCells });

        io.to(player1Socket).emit('pvpBoardUpdate', {
            board: emptyBoard,
            playerIndex: 0,
            opponentName: player2Name,
            opponentProgress: 0,
            totalSafeCells
        });

        io.to(player2Socket).emit('pvpBoardUpdate', {
            board: emptyBoard,
            playerIndex: 1,
            opponentName: player1Name,
            opponentProgress: 0,
            totalSafeCells
        });
    } catch (error) {
        console.error('Error in startPvpGame:', error);
    }
};

/**
 * Handles 'resetMyBoard' event
 */
const resetMyBoard = async ({ socket, room, isValid, client, io }) => {
    try {
        if (!room || typeof room !== 'string') return;
        if (!(await isValid(room))) return;

        const roomState = await client.hGetAll(`room:${room}`);
        const mode = roomState.mode || 'co-op';
        if (mode !== 'pvp') return;

        if (roomState.winnerSocket && roomState.winnerSocket !== '') return;

        const playerData = await client.hGetAll(`player:${socket.id}`);
        const playerIndex = parseInt(playerData.pvpPlayerIndex || '0', 10);
        const numRows = parseInt(roomState.numRows, 10);
        const numCols = parseInt(roomState.numCols, 10);
        const emptyBoard = createEmptyBoard(numRows, numCols);

        const boardKey = `player${playerIndex + 1}Board`;
        const initializedKey = `player${playerIndex + 1}Initialized`;
        const gameOverKey = `player${playerIndex + 1}GameOver`;
        const progressKey = `player${playerIndex + 1}Progress`;

        await client.hSet(`room:${room}`, {
            [boardKey]: JSON.stringify(emptyBoard),
            [initializedKey]: 'false',
            [gameOverKey]: 'false',
            [progressKey]: '0',
        });

        await client.hSet(`player:${socket.id}`, { score: '0' });

        io.to(socket.id).emit('pvpBoardUpdate', {
            board: emptyBoard,
            playerIndex,
            opponentName: playerData.opponentName || 'Opponent'
        });

        const players = JSON.parse(roomState.players || '[]');
        const opponentSocket = players.find(p => p !== socket.id);
        if (opponentSocket) {
            io.to(opponentSocket).emit('pvpOpponentReset');
            const numMines = parseInt(roomState.numMines, 10);
            const totalSafeCells = (numRows * numCols) - numMines;
            io.to(opponentSocket).emit('pvpOpponentProgress', {
                progress: 0,
                totalSafeCells,
                percentage: 0
            });
        }

        await updatePlayerStatsInRoom(room);
    } catch (error) {
        console.error('Error in resetMyBoard:', error);
    }
};

/**
 * Handles 'pvpRematch' event
 */
const pvpRematch = async ({ socket, room, isValid, client, io }) => {
    try {
        if (!room || typeof room !== 'string') return;
        if (!(await isValid(room))) return;

        const roomState = await client.hGetAll(`room:${room}`);
        const mode = roomState.mode || 'co-op';
        if (mode !== 'pvp') return;

        if (roomState.hostSocket !== socket.id) return;

        const players = JSON.parse(roomState.players || '[]');
        if (players.length !== 2) return;

        const numRows = parseInt(roomState.numRows, 10);
        const numCols = parseInt(roomState.numCols, 10);
        const numMines = parseInt(roomState.numMines, 10);
        const totalSafeCells = (numRows * numCols) - numMines;

        const emptyBoard = createEmptyBoard(numRows, numCols);

        await client.hSet(`room:${room}`, {
            pvpStarted: 'true',
            totalSafeCells: totalSafeCells.toString(),
            player1Board: JSON.stringify(emptyBoard),
            player2Board: JSON.stringify(emptyBoard),
            player1Initialized: 'false',
            player2Initialized: 'false',
            player1GameOver: 'false',
            player2GameOver: 'false',
            player1GameWon: 'false',
            player2GameWon: 'false',
            player1Progress: '0',
            player2Progress: '0',
            winnerSocket: '',
        });

        const player1Socket = roomState.player1Socket;
        const player2Socket = roomState.player2Socket;

        await client.hSet(`player:${player1Socket}`, { score: '0' });
        await client.hSet(`player:${player2Socket}`, { score: '0' });

        const player1Name = await client.hGet(`player:${player1Socket}`, 'name');
        const player2Name = await client.hGet(`player:${player2Socket}`, 'name');

        io.to(player1Socket).emit('pvpRematchStarted', { totalSafeCells, isHost: true });
        io.to(player2Socket).emit('pvpRematchStarted', { totalSafeCells, isHost: false });

        io.to(player1Socket).emit('pvpBoardUpdate', {
            board: emptyBoard,
            playerIndex: 0,
            opponentName: player2Name,
            opponentProgress: 0,
            totalSafeCells
        });

        io.to(player2Socket).emit('pvpBoardUpdate', {
            board: emptyBoard,
            playerIndex: 1,
            opponentName: player1Name,
            opponentProgress: 0,
            totalSafeCells
        });

        await updatePlayerStatsInRoom(room);
    } catch (error) {
        console.error('Error in pvpRematch:', error);
    }
};

module.exports = { startPvpGame, resetMyBoard, pvpRematch };
