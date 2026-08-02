const { io } = require('./initializeClient');
const { createEmptyBoard, projectBoard } = require('../domain/board');
const { pvpPlayerFields } = require('../data/keys');
const { scheduleForfeit } = require('./pvpForfeit');
const roomRepo = require('../data/roomRepo');
const { clockOf } = require('../domain/clock');
const playerRepo = require('../data/playerRepo');
const sessionRepo = require('../data/sessionRepo');
const { SERVER_EVENTS } = require('../../shared/events');

// Basically updates the player's stats whenever:
// 1) A player joins/leaves the room
// 2) A player increments their score
const updatePlayerStatsInRoom = async (room) => {
    if (!room) return; // Necessary??
    const playersInRoom = await roomRepo.getPlayers(room);
    if (!playersInRoom) return;

    // Fetch all player data in parallel for better performance
    const playerDataPromises = playersInRoom.map(playerId =>
        playerRepo.getState(playerId)
    );
    const playerStates = await Promise.all(playerDataPromises);

    // Filter out null/undefined player states and map to stats
    const updatedStats = playerStates
        .filter(playerState => playerState && playerState.name)
        .map(playerState => ({
            name: playerState.name,
            score: parseInt(playerState.score || '0', 10) || 0
        }));

    io.to(room).emit(SERVER_EVENTS.PLAYER_STATS_UPDATE, updatedStats);
}

const resetPlayerScores = async (room) => {
    if (!room) return;
    const playersInRoom = await roomRepo.getPlayers(room);

    if (!playersInRoom) return;

    // Reset all player scores in parallel for better performance
    const resetPromises = playersInRoom.map(playerId =>
        playerRepo.resetScore(playerId)
    );
    await Promise.all(resetPromises);
}

/**
 * Adds a player to a room, or restores one that reconnected.
 *
 * `sessionId` is the browser's persistent id. When it is supplied and already
 * points at a different socket, this is a reconnect rather than a new player:
 * the old socket's record is dropped and its place in the room is handed to the
 * new socket, so a reload does not leave a ghost behind or lose the host.
 */
/**
 * Puts a returning racer back into a PVP game already in progress.
 *
 * A race is per-player in a way co-op is not: the board, the progress and the
 * win/loss flags all live under this player's slot, and the room addresses that
 * slot by socket id. A reload changes the socket, so the slot has to be
 * repointed or the room is still talking to a socket that no longer exists.
 *
 * What is sent mirrors what `startPvpGame` sends, because the client has to end
 * up in the same state either way — `pvpStarted` set, their own board on screen,
 * the opponent named and their progress known.
 *
 * Returns false when there is nothing to restore, so the caller can fall back to
 * the empty board the lobby shows.
 */
const restorePvpRacer = async (room, socketId, roomState, previousSocketId) => {
    if (roomState.pvpStarted !== 'true') return false;

    // The room addresses slots by socket, so the slot is found by who used to
    // hold it — not by the player record, which the reconnect just replaced.
    const slot = [0, 1].find(
        (index) => roomState[pvpPlayerFields(index).socketKey] === previousSocketId
    );
    if (slot === undefined) return false;

    const { boardKey, gameOverKey, gameWonKey, socketKey } = pvpPlayerFields(slot);
    const boardData = roomState[boardKey];
    if (!boardData) return false;

    const opponent = pvpPlayerFields(slot === 0 ? 1 : 0);
    const opponentName = (await playerRepo.getName(roomState[opponent.socketKey])) || 'Opponent';
    const opponentProgress = parseInt(roomState[opponent.progressKey], 10) || 0;

    /*
     * Rebuild the player's identity from the ROOM, not from their old record —
     * `removePlayer` deleted that the moment they dropped, so by the time they
     * are back there is nothing left to copy. The room outlives the socket and
     * is what actually owns the race.
     *
     * `pvpPlayerIndex` is the load-bearing field: pvp.js refuses to act for a
     * socket it cannot place, so without it they get their board back and every
     * click on it is silently ignored.
     */
    await roomRepo.setFields(room, { [socketKey]: socketId });
    await playerRepo.setFields(socketId, {
        pvpPlayerIndex: slot.toString(),
        opponentName,
    });
    const totalSafeCells = parseInt(roomState.totalSafeCells, 10) || 0;
    const ownGameOver = roomState[gameOverKey] === 'true';
    const ownGameWon = roomState[gameWonKey] === 'true';

    // pvpStarted first: it is what takes the client out of the lobby, and the
    // board that follows is unusable until it lands.
    io.to(socketId).emit(SERVER_EVENTS.PVP_GAME_STARTED, { totalSafeCells });

    io.to(socketId).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
        // Their own run is over, so their own mines are no longer a secret. The
        // opponent's board is a separate record and is not touched here.
        board: projectBoard(JSON.parse(boardData), { revealMines: ownGameOver || ownGameWon }),
        playerIndex: slot,
        opponentName,
        opponentProgress,
        totalSafeCells,
    });

    // Catch them up on an outcome that landed while they were gone.
    if (roomState.winnerSocket) {
        io.to(socketId).emit(SERVER_EVENTS.PVP_PLAYER_WON, {
            winnerSocket: roomState.winnerSocket,
            winnerName: await playerRepo.getName(roomState.winnerSocket) || 'Someone',
        });
    } else if (ownGameOver) {
        io.to(socketId).emit(SERVER_EVENTS.PVP_GAME_OVER);
    }

    return true;
};

const addPlayerToRoom = async (room, socketId, name, sessionId) => {
    // Rejoining cancels any grace period the room was counting down.
    await roomRepo.touch(room);

    // Was this browser previously here under a different socket?
    let reconnectedFrom = null;
    if (sessionId) {
        const previousSocketId = await sessionRepo.getSocketId(sessionId);
        if (previousSocketId && previousSocketId !== socketId) {
            reconnectedFrom = previousSocketId;
            await playerRepo.remove(previousSocketId);
        }
        await sessionRepo.save(sessionId, { room, name, socketId });
    }

    const playerExists = await playerRepo.exists(socketId);
    if (!playerExists) {
        await playerRepo.create(socketId, { room, name, sessionId });
    } else {
        // Update room and name (in case player rejoins with different name)
        await playerRepo.setFields(socketId, { room, name, sessionId: sessionId || '' });
    }

    // Add the player to the room
    const roomState = await roomRepo.getState(room);
    const mode = roomState.mode || 'co-op';

    // A reconnecting host keeps the host role.
    if (reconnectedFrom && roomState.hostSocket === reconnectedFrom) {
        await roomRepo.setFields(room, { hostSocket: socketId });
    }

    /*
     * Catching the ARRIVAL up on an outcome they missed, so it goes to them and
     * not to the room. Everyone already here saw it happen; re-broadcasting
     * re-opens the end-of-game summary on their screen and fires the confetti
     * again. That was rare when it took a deliberate join of a finished room —
     * now that a reload rejoins automatically, it would fire every time someone
     * refreshed.
     */
    if (roomState.gameWon === "true") {
        io.to(socketId).emit(SERVER_EVENTS.GAME_WON);
    }

    if (roomState.gameOver === "true") {
        // Get the name of whoever hit the mine (stored in room state or empty)
        const gameOverName = roomState.gameOverName || "Someone";
        io.to(socketId).emit(SERVER_EVENTS.GAME_OVER, gameOverName);
    }

    const roomPlayers = roomRepo.playersFrom(roomState);

    if (reconnectedFrom && roomPlayers.includes(reconnectedFrom)) {
        // Take the old socket's slot rather than joining as an extra player,
        // which in PVP would otherwise read as a third player and be rejected.
        roomPlayers[roomPlayers.indexOf(reconnectedFrom)] = socketId;
        await roomRepo.setPlayers(room, roomPlayers);
    } else if (!roomPlayers.includes(socketId)) {
        roomPlayers.push(socketId);
        await roomRepo.setPlayers(room, roomPlayers);
    }

    // A late join or a reconnect must pick up the clock already running, which is
    // the whole reason it is stored as timestamps rather than an elapsed count.
    io.to(socketId).emit(SERVER_EVENTS.GAME_CLOCK, clockOf(roomState));

    // Send the current board to the player who joined (only for co-op)
    // For PVP, boards are sent when game starts
    if (mode === 'co-op') {
        const board = JSON.parse(roomState.board);
        // Someone joining a finished game should see the mines; mid-game they
        // must not. Without this a player could join, read the layout, and leave.
        const isOver = roomState.gameOver === 'true' || roomState.gameWon === 'true';
        io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, projectBoard(board, { revealMines: isOver }));
    } else if (mode === 'pvp') {
        const restored = reconnectedFrom
            ? await restorePvpRacer(room, socketId, roomState, reconnectedFrom)
            : false;

        if (!restored) {
            // Nothing in flight for this socket: the lobby's empty board, as before.
            const numRows = parseInt(roomState.numRows, 10);
            const numCols = parseInt(roomState.numCols, 10);
            const emptyBoard = createEmptyBoard(numRows, numCols);
            io.to(socketId).emit(SERVER_EVENTS.BOARD_UPDATE, emptyBoard);
        }
    }

    await updatePlayerStatsInRoom(room);
}

const removePlayer = async (socket, socketId) => {
    const playerExists = await playerRepo.exists(socketId);
    if (!playerExists) return;

    const room = await playerRepo.getRoom(socketId);
    if (!room) return;

    const roomState = await roomRepo.getState(room);
    if (!roomState || !roomState.players) {
        // Room already deleted, just clean up player
        socket.leave(room);
        await playerRepo.remove(socketId);
        return;
    }

    const playersInRoom = roomRepo.playersFrom(roomState);
    const mode = roomState.mode || 'co-op';

    if (playersInRoom && playersInRoom.includes(socketId)) {
        const index = playersInRoom.indexOf(socketId);
        if (index > -1) {
            playersInRoom.splice(index, 1);
        }

        // Persist the departure before deciding what happens to the room.
        await roomRepo.setPlayers(room, playersInRoom);

        // An emptied room is kept briefly rather than deleted, so a player who
        // dropped out can reconnect straight back into it.
        if (playersInRoom.length === 0) {
            await roomRepo.startGracePeriod(room);
        } else {
            /*
             * A disconnect mid-race USED to hand the win over immediately. A
             * reload is a disconnect too, so refreshing the page forfeited the
             * game before the tab had finished reloading. The decision now waits
             * to see whether they come back — see pvpForfeit.js.
             */
            if (mode === 'pvp' && roomState.pvpStarted === 'true' && !roomState.winnerSocket) {
                const player1Won = roomState.player1GameWon === 'true';
                const player2Won = roomState.player2GameWon === 'true';
                if (!player1Won && !player2Won) {
                    scheduleForfeit(room, playersInRoom[0]);
                }
            }

            // Handle PVP disconnection before game starts - reset room ready state
            if (mode === 'pvp' && roomState.pvpStarted !== 'true') {
                const remainingPlayer = playersInRoom[0];

                // If the leaving player was the host, transfer host to remaining player
                if (roomState.hostSocket === socketId) {
                    await roomRepo.setFields(room, { hostSocket: remainingPlayer });
                    io.to(remainingPlayer).emit(SERVER_EVENTS.PVP_HOST_TRANSFERRED);
                }

                // Notify remaining player to go back to waiting state
                io.to(remainingPlayer).emit(SERVER_EVENTS.PVP_OPPONENT_LEFT_BEFORE_START);
            }

            await updatePlayerStatsInRoom(room);
            // Notify other players to remove this player's hover
            socket.to(room).emit(SERVER_EVENTS.PLAYER_LEFT, socketId);
        }
    }
    socket.leave(room);
    await playerRepo.remove(socketId);
}

module.exports = { updatePlayerStatsInRoom, resetPlayerScores, addPlayerToRoom, removePlayer };