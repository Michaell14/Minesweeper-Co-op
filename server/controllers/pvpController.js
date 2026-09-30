const { revealFrom, projectBoard } = require('../domain/board');
const { generateBoard } = require('../domain/boardGen');
const { updatePlayerStatsInRoom } = require('../utils/playerUtils');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { pvpPlayerFields } = require('../data/keys');
const { pvpIndexOf } = require('../domain/pvpPlayer');
const { startedAtOf } = require('../domain/clock');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * Builds the single board both players race on. One shared cell is chosen up
 * front, the board is generated (no-guess verified) around it and opened for
 * both, so progress starts level and nobody can lose on their first click.
 * Generating around each player's own first click made the boards differ.
 */
const buildSharedBoard = (numRows, numCols, numMines) => {
    const startRow = Math.floor(numRows / 2);
    const startCol = Math.floor(numCols / 2);
    const board = generateBoard(numRows, numCols, numMines, startRow, startCol);

    const { cellsRevealed } = revealFrom(board, startRow, startCol, []);
    return { board, openedCells: cellsRevealed };
};

/**
 * Start and rematch both replace two boards. Lock in index order and re-read
 * before deciding: duplicate requests must not redeal an already-started race.
 * Keep publication inside the locks so a late board payload cannot undo a move.
 */
const startRace = async ({ socket, room, io }, rematch = false) =>
    roomRepo.withJoinLock(room, socket.id, () => roomRepo.withPvpActionLock(room, 0, socket.id, () =>
        roomRepo.withPvpActionLock(room, 1, socket.id, async () => {
            const roomState = await roomRepo.getState(room);
            const mode = roomState.mode || 'co-op';
            if (mode !== 'pvp') return;

            const players = roomRepo.playersFrom(roomState);
            if (players.length !== 2) return;

            if (roomState.hostSocket !== socket.id) return;
            if (roomState.pvpStarted === 'true' && (!rematch || !roomState.winnerSocket)) return;

            const numRows = parseInt(roomState.numRows, 10);
            const numCols = parseInt(roomState.numCols, 10);
            const numMines = parseInt(roomState.numMines, 10);
            const totalSafeCells = (numRows * numCols) - numMines;

            const player1Socket = roomState.hostSocket;
            const player2Socket = players.find(p => p !== player1Socket);
            if (!players.includes(player1Socket) || !player2Socket) return;
            const { board: sharedBoard, openedCells } = buildSharedBoard(numRows, numCols, numMines);
            const serializedBoard = JSON.stringify(sharedBoard);

            // Both players race from the same server timestamp.
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
                player1EndedAt: '',
                player2EndedAt: '',
                player1Progress: openedCells.toString(),
                player2Progress: openedCells.toString(),
                winnerSocket: '',
                // Pristine copy for resetMyBoard to restore from.
                sharedBoard: serializedBoard,
                sharedOpenedCells: openedCells.toString(),
            });

            const player1Name = await playerRepo.getName(player1Socket);
            const player2Name = await playerRepo.getName(player2Socket);
            const player1Avatar = await playerRepo.getAvatar(player1Socket);
            const player2Avatar = await playerRepo.getAvatar(player2Socket);

            // opponentAvatar rides on the player record like the name: resetMyBoard re-emits identity from it.
            await playerRepo.setFields(player1Socket, {
                pvpPlayerIndex: '0',
                opponentName: player2Name,
                opponentAvatar: player2Avatar || ''
            });
            await playerRepo.setFields(player2Socket, {
                pvpPlayerIndex: '1',
                opponentName: player1Name,
                opponentAvatar: player1Avatar || ''
            });

            if (rematch) {
                await playerRepo.resetScore(player1Socket);
                await playerRepo.resetScore(player2Socket);
            }

            io.to(room).emit(SERVER_EVENTS.GAME_CLOCK, { startedAt, endedAt: null });
            if (rematch) {
                io.to(player1Socket).emit(SERVER_EVENTS.PVP_REMATCH_STARTED, { totalSafeCells, isHost: true });
                io.to(player2Socket).emit(SERVER_EVENTS.PVP_REMATCH_STARTED, { totalSafeCells, isHost: false });
            } else {
                io.to(room).emit(SERVER_EVENTS.PVP_GAME_STARTED, { totalSafeCells });
            }

            const visibleBoard = projectBoard(sharedBoard);

            io.to(player1Socket).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
                board: visibleBoard,
                playerIndex: 0,
                opponentName: player2Name,
                opponentAvatar: player2Avatar,
                opponentProgress: openedCells,
                totalSafeCells
            });

            io.to(player2Socket).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
                board: visibleBoard,
                playerIndex: 1,
                opponentName: player1Name,
                opponentAvatar: player1Avatar,
                opponentProgress: openedCells,
                totalSafeCells
            });
            if (rematch) await updatePlayerStatsInRoom(room);
        })));

/** Handles 'startPvpGame'. */
const startPvpGame = async (request) => {
    try {
        await startRace(request);
    } catch (error) {
        console.error('Error in startPvpGame:', error);
    }
};

/** Handles 'resetMyBoard'. */
const resetMyBoard = async ({ socket, room, io }) => {
    try {
        const initialState = await roomRepo.getState(room);
        const mode = initialState.mode || 'co-op';
        if (mode !== 'pvp') return;

        if (initialState.winnerSocket) return;

        const initialPlayer = await playerRepo.getState(socket.id);
        // No index-0 fallback: that once reset PLAYER ONE's board for a socket that owns neither.
        const playerIndex = pvpIndexOf(initialPlayer);
        if (playerIndex === null) {
            console.error(`Player ${socket.id} asked to reset with no pvpPlayerIndex set!`);
            return;
        }

        // A winning move or rematch can finish while this request waits.
        await roomRepo.withPvpActionLock(room, playerIndex, socket.id, async () => {
            const roomState = await roomRepo.getState(room);
            const playerData = await playerRepo.getState(socket.id);
            if (roomState.mode !== 'pvp' || roomState.pvpStarted !== 'true' || roomState.winnerSocket) return;
            if (pvpIndexOf(playerData) !== playerIndex) return;

            // Restore the shared starting position, not a blank grid: a retry goes back to where the game began.
            const { sharedBoard, sharedOpenedCells } = roomState;
            if (!sharedBoard) return;
            const openedCells = parseInt(sharedOpenedCells || '0', 10);

            const { boardKey, initializedKey, gameOverKey, progressKey, endedAtKey } = pvpPlayerFields(playerIndex);

            await roomRepo.setFields(room, {
                [boardKey]: sharedBoard,
                [initializedKey]: 'true',
                [gameOverKey]: 'false',
                [endedAtKey]: '',
                [progressKey]: openedCells.toString(),
            });

            await playerRepo.resetScore(socket.id);

            // Their clock restarts from the shared start; pvp.js stopped it when they hit the mine.
            io.to(socket.id).emit(SERVER_EVENTS.GAME_CLOCK, {
                startedAt: startedAtOf(roomState),
                endedAt: null
            });

            io.to(socket.id).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
                board: projectBoard(JSON.parse(sharedBoard)),
                playerIndex,
                opponentName: playerData.opponentName || 'Opponent',
                opponentAvatar: playerData.opponentAvatar || null
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
        });
    } catch (error) {
        console.error('Error in resetMyBoard:', error);
    }
};

/** Handles 'pvpRematch'. */
const pvpRematch = async (request) => {
    try {
        await startRace(request, true);
    } catch (error) {
        console.error('Error in pvpRematch:', error);
    }
};

module.exports = { startPvpGame, resetMyBoard, pvpRematch };
