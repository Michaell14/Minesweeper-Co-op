const { revealFrom, projectBoard } = require('../domain/board');
const { generateBoard } = require('../domain/boardGen');
const { updatePlayerStatsInRoom } = require('../utils/playerUtils');
const { isValidRoomCode } = require('../validation');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { pvpPlayerFields } = require('../data/keys');
const { pvpIndexOf } = require('../domain/pvpPlayer');
const { startedAtOf } = require('../domain/clock');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * Builds the single board both players race on.
 *
 * Both players get the SAME mine layout, so the race is like-for-like. That
 * rules out generating it around each player's own first click, which is what
 * used to make the two boards differ — so instead one shared cell is chosen up
 * front, the board is generated (and no-guess verified) around it, and that cell
 * is opened for both. Players start from an identical opening rather than a
 * blank grid, and nobody can lose on their first click.
 */
const buildSharedBoard = (numRows, numCols, numMines) => {
    const startRow = Math.floor(numRows / 2);
    const startCol = Math.floor(numCols / 2);
    const board = generateBoard(numRows, numCols, numMines, startRow, startCol);

    // Apply the opening move to the board itself, so both players receive it
    // already revealed and their progress starts level.
    const { cellsRevealed } = revealFrom(board, startRow, startCol, []);
    return { board, openedCells: cellsRevealed };
};

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
        const { board: sharedBoard, openedCells } = buildSharedBoard(numRows, numCols, numMines);
        const serializedBoard = JSON.stringify(sharedBoard);

        // Both players race the same board from the same moment, so the start is
        // room state. Their finishes are not — see pvp.js.
        const startedAt = Date.now();

        await roomRepo.setFields(room, {
            pvpStarted: 'true',
            startedAt: startedAt.toString(),
            endedAt: '',
            totalSafeCells: totalSafeCells.toString(),
            player1Socket,
            player2Socket,
            // The same layout for both, already opened at the shared start cell.
            player1Board: serializedBoard,
            player2Board: serializedBoard,
            player1Initialized: 'true',
            player2Initialized: 'true',
            player1GameOver: 'false',
            player2GameOver: 'false',
            player1GameWon: 'false',
            player2GameWon: 'false',
            player1Progress: openedCells.toString(),
            player2Progress: openedCells.toString(),
            winnerSocket: '',
            // Pristine copy, so resetMyBoard can restore this player's board
            // to the shared starting state rather than a blank grid.
            sharedBoard: serializedBoard,
            sharedOpenedCells: openedCells.toString(),
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

        io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt, endedAt: null });
        io.to(room).emit(SERVER_EVENTS.PVP_GAME_STARTED, { totalSafeCells });

        const visibleBoard = projectBoard(sharedBoard);

        io.to(player1Socket).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
            board: visibleBoard,
            playerIndex: 0,
            opponentName: player2Name,
            opponentProgress: openedCells,
            totalSafeCells
        });

        io.to(player2Socket).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
            board: visibleBoard,
            playerIndex: 1,
            opponentName: player1Name,
            opponentProgress: openedCells,
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
        // No fallback to index 0: that reset — and, once resets took a lock,
        // locked — PLAYER ONE's board on behalf of a socket that owns neither.
        const playerIndex = pvpIndexOf(playerData);
        if (playerIndex === null) {
            console.error(`Player ${socket.id} asked to reset with no pvpPlayerIndex set!`);
            return;
        }

        // Restore the shared starting position rather than a blank grid: both
        // players race the same layout, so a retry has to put this player back
        // where the game began, not on a board of their own.
        const { sharedBoard, sharedOpenedCells } = roomState;
        if (!sharedBoard) return;
        const openedCells = parseInt(sharedOpenedCells || '0', 10);

        const { boardKey, initializedKey, gameOverKey, progressKey } = pvpPlayerFields(playerIndex);

        // Under this player's action lock: a move of theirs still in flight
        // would otherwise write its board back over the restored one, leaving
        // them on a board that is neither the retry nor the game they lost.
        await roomRepo.withPvpActionLock(room, playerIndex, socket.id, async () => {
            await roomRepo.setFields(room, {
                [boardKey]: sharedBoard,
                [initializedKey]: 'true',
                [gameOverKey]: 'false',
                [progressKey]: openedCells.toString(),
            });

            await playerRepo.resetScore(socket.id);
        });

        // Retrying puts this player back in the race, so their clock has to
        // restart from the room's shared start — pvp.js stopped it when they hit
        // the mine, and without this it stays frozen at their death for the rest
        // of the game.
        io.to(socket.id).emit(SERVER_EVENTS.GAME_CLOCK, {
            startedAt: startedAtOf(roomState),
            endedAt: null
        });

        io.to(socket.id).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
            board: projectBoard(JSON.parse(sharedBoard)),
            playerIndex,
            opponentName: playerData.opponentName || 'Opponent'
        });

        const players = roomRepo.playersFrom(roomState);
        const opponentSocket = players.find(p => p !== socket.id);
        if (opponentSocket) {
            io.to(opponentSocket).emit(SERVER_EVENTS.PVP_OPPONENT_RESET);
            const numRows = parseInt(roomState.numRows, 10);
            const numCols = parseInt(roomState.numCols, 10);
            const numMines = parseInt(roomState.numMines, 10);
            const totalSafeCells = (numRows * numCols) - numMines;
            io.to(opponentSocket).emit(SERVER_EVENTS.PVP_OPPONENT_PROGRESS, {
                progress: openedCells,
                totalSafeCells,
                percentage: totalSafeCells > 0 ? Math.round((openedCells / totalSafeCells) * 100) : 0
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

        const { board: sharedBoard, openedCells } = buildSharedBoard(numRows, numCols, numMines);
        const serializedBoard = JSON.stringify(sharedBoard);

        // Both players race the same board from the same moment, so the start is
        // room state. Their finishes are not — see pvp.js.
        const startedAt = Date.now();

        const player1Socket = roomState.player1Socket;
        const player2Socket = roomState.player2Socket;

        // Both players' boards are rewritten here, so both action locks are
        // held — in index order, which is the only ordering anything takes them
        // in. A move from the last game still in flight would otherwise land on
        // the rematch board. (startPvpGame needs none of this: it refuses to run
        // once pvpStarted is 'true', and no move runs until it is.)
        await roomRepo.withPvpActionLock(room, 0, socket.id, async () => {
            await roomRepo.withPvpActionLock(room, 1, socket.id, async () => {
                await roomRepo.setFields(room, {
                    pvpStarted: 'true',
                    startedAt: startedAt.toString(),
                    endedAt: '',
                    totalSafeCells: totalSafeCells.toString(),
                    player1Board: serializedBoard,
                    player2Board: serializedBoard,
                    player1Initialized: 'true',
                    player2Initialized: 'true',
                    player1GameOver: 'false',
                    player2GameOver: 'false',
                    player1GameWon: 'false',
                    player2GameWon: 'false',
                    player1Progress: openedCells.toString(),
                    player2Progress: openedCells.toString(),
                    winnerSocket: '',
                    // Pristine copy, so resetMyBoard can restore this player's
                    // board to the shared starting state rather than a blank grid.
                    sharedBoard: serializedBoard,
                    sharedOpenedCells: openedCells.toString(),
                });

                await playerRepo.resetScore(player1Socket);
                await playerRepo.resetScore(player2Socket);
            });
        });

        const player1Name = await playerRepo.getName(player1Socket);
        const player2Name = await playerRepo.getName(player2Socket);

        io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt, endedAt: null });
        io.to(player1Socket).emit(SERVER_EVENTS.PVP_REMATCH_STARTED, { totalSafeCells, isHost: true });
        io.to(player2Socket).emit(SERVER_EVENTS.PVP_REMATCH_STARTED, { totalSafeCells, isHost: false });

        const visibleBoard = projectBoard(sharedBoard);

        io.to(player1Socket).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
            board: visibleBoard,
            playerIndex: 0,
            opponentName: player2Name,
            opponentProgress: openedCells,
            totalSafeCells
        });

        io.to(player2Socket).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
            board: visibleBoard,
            playerIndex: 1,
            opponentName: player1Name,
            opponentProgress: openedCells,
            totalSafeCells
        });

        await updatePlayerStatsInRoom(room);
    } catch (error) {
        console.error('Error in pvpRematch:', error);
    }
};

module.exports = { startPvpGame, resetMyBoard, pvpRematch };
