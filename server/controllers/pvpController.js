const { createEmptyBoard } = require('../domain/board');
const { updatePlayerStatsInRoom } = require('../utils/playerUtils');
const { isValidRoomCode } = require('../validation');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { pvpPlayerFields } = require('../data/keys');

/**
 * Handles 'startPvpGame' event
 */
const startPvpGame = async ({ socket, room, isValid, io }) => {
    try {
        if (!isValidRoomCode(room)) return;
        if (!(await isValid(room))) return;

        const roomState = await roomRepo.getState(room);
        const mode = roomState.mode || 'co-op';
        if (mode !== 'pvp') return;

        const players = roomRepo.playersFrom(roomState);
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

        await roomRepo.setFields(room, {
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

        const player1Name = await playerRepo.getName(player1Socket);
        const player2Name = await playerRepo.getName(player2Socket);

        await playerRepo.setFields(player1Socket, {
            pvpPlayerIndex: '0',
            opponentName: player2Name
        });
        await playerRepo.setFields(player2Socket, {
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
const resetMyBoard = async ({ socket, room, isValid, io }) => {
    try {
        if (!isValidRoomCode(room)) return;
        if (!(await isValid(room))) return;

        const roomState = await roomRepo.getState(room);
        const mode = roomState.mode || 'co-op';
        if (mode !== 'pvp') return;

        if (roomState.winnerSocket && roomState.winnerSocket !== '') return;

        const playerData = await playerRepo.getState(socket.id);
        const playerIndex = parseInt(playerData.pvpPlayerIndex || '0', 10);
        const numRows = parseInt(roomState.numRows, 10);
        const numCols = parseInt(roomState.numCols, 10);
        const emptyBoard = createEmptyBoard(numRows, numCols);

        const { boardKey, initializedKey, gameOverKey, progressKey } = pvpPlayerFields(playerIndex);

        await roomRepo.setFields(room, {
            [boardKey]: JSON.stringify(emptyBoard),
            [initializedKey]: 'false',
            [gameOverKey]: 'false',
            [progressKey]: '0',
        });

        await playerRepo.resetScore(socket.id);

        io.to(socket.id).emit('pvpBoardUpdate', {
            board: emptyBoard,
            playerIndex,
            opponentName: playerData.opponentName || 'Opponent'
        });

        const players = roomRepo.playersFrom(roomState);
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
const pvpRematch = async ({ socket, room, isValid, io }) => {
    try {
        if (!isValidRoomCode(room)) return;
        if (!(await isValid(room))) return;

        const roomState = await roomRepo.getState(room);
        const mode = roomState.mode || 'co-op';
        if (mode !== 'pvp') return;

        if (roomState.hostSocket !== socket.id) return;

        const players = roomRepo.playersFrom(roomState);
        if (players.length !== 2) return;

        const numRows = parseInt(roomState.numRows, 10);
        const numCols = parseInt(roomState.numCols, 10);
        const numMines = parseInt(roomState.numMines, 10);
        const totalSafeCells = (numRows * numCols) - numMines;

        const emptyBoard = createEmptyBoard(numRows, numCols);

        await roomRepo.setFields(room, {
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

        await playerRepo.resetScore(player1Socket);
        await playerRepo.resetScore(player2Socket);

        const player1Name = await playerRepo.getName(player1Socket);
        const player2Name = await playerRepo.getName(player2Socket);

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
