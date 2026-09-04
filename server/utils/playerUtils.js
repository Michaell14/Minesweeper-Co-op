const { io } = require('./initializeClient');
const { createEmptyBoard, projectBoard } = require('../domain/board');
const { pvpPlayerFields } = require('../data/keys');
const { scheduleForfeit } = require('./pvpForfeit');
const roomRepo = require('../data/roomRepo');
const { clockOf } = require('../domain/clock');
const playerRepo = require('../data/playerRepo');
const sessionRepo = require('../data/sessionRepo');
const { sessionHolder } = require('./sessionGuard');
const { isValidAvatarId, isValidSessionId } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/** Rebroadcasts the score table. Called on join, leave and every score change. */
const updatePlayerStatsInRoom = async (room) => {
    if (!room) return;
    const playersInRoom = await roomRepo.getPlayers(room);
    if (!playersInRoom) return;

    const playerStates = await Promise.all(
        playersInRoom.map(playerId => playerRepo.getState(playerId))
    );

    const updatedStats = playerStates
        .filter(playerState => playerState && playerState.name)
        .map(playerState => ({
            name: playerState.name,
            // '' stores "anonymous"; the payload says null.
            avatar: playerState.avatar || null,
            score: parseInt(playerState.score || '0', 10) || 0
        }));

    io.to(room).emit(SERVER_EVENTS.PLAYER_STATS_UPDATE, updatedStats);
}

const resetPlayerScores = async (room) => {
    if (!room) return;
    const playersInRoom = await roomRepo.getPlayers(room);
    if (!playersInRoom) return;

    await Promise.all(playersInRoom.map(playerId => playerRepo.resetScore(playerId)));
}

/**
 * Puts a returning racer back into a PVP game in progress. The board, progress
 * and win/loss flags live under this player's slot, addressed by socket id, so
 * a reload has to repoint the slot. Sends what `startPvpGame` sends. Returns
 * false when there is nothing to restore.
 */
const restorePvpRacer = async (room, socketId, roomState, previousSocketId) => {
    if (roomState.pvpStarted !== 'true') return false;

    // Slots are addressed by socket, so look up by who used to hold it.
    const slot = roomRepo.pvpSlotOf(roomState, previousSocketId);
    if (slot === undefined) return false;

    const { boardKey, gameOverKey, gameWonKey, socketKey } = pvpPlayerFields(slot);
    const boardData = roomState[boardKey];
    if (!boardData) return false;

    const opponent = pvpPlayerFields(slot === 0 ? 1 : 0);
    const opponentName = (await playerRepo.getName(roomState[opponent.socketKey])) || 'Opponent';
    const opponentAvatar = await playerRepo.getAvatar(roomState[opponent.socketKey]);
    const opponentProgress = parseInt(roomState[opponent.progressKey], 10) || 0;

    /*
     * Rebuilt from the ROOM: `removePlayer` already deleted the old record.
     * `pvpPlayerIndex` is load-bearing: pvp.js silently ignores every click
     * from a socket it cannot place.
     */
    await roomRepo.setFields(room, { [socketKey]: socketId });
    await playerRepo.setFields(socketId, {
        pvpPlayerIndex: slot.toString(),
        opponentName,
        opponentAvatar: opponentAvatar || '',
    });
    const totalSafeCells = parseInt(roomState.totalSafeCells, 10) || 0;
    const ownGameOver = roomState[gameOverKey] === 'true';
    const ownGameWon = roomState[gameWonKey] === 'true';

    // pvpStarted first: it takes the client out of the lobby.
    io.to(socketId).emit(SERVER_EVENTS.PVP_GAME_STARTED, { totalSafeCells });

    io.to(socketId).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
        /*
         * Revealed only once the RACE is over, as game/pvp.js does on detonation:
         * a racer can `resetMyBoard` and race the same layout, so revealing here
         * would be the die-and-read exploit with a reload in place of the reset.
         */
        board: projectBoard(JSON.parse(boardData), {
            revealMines: ownGameWon || Boolean(roomState.winnerSocket),
        }),
        playerIndex: slot,
        opponentName,
        opponentAvatar,
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

/**
 * Adds a player to a room, or restores one that reconnected. When `sessionId`
 * (the browser's persistent id) already points at a different socket, this is
 * a reconnect: the old socket's place in the room is handed to the new one.
 */
const addPlayerToRoom = async (room, socketId, name, sessionId, avatar) => {
    // A connect-time snapshot from socket.data.user; validated so only catalog ids are stored.
    const storedAvatar = isValidAvatarId(avatar) ? avatar : '';

    // Rejoining cancels any grace period the room was counting down.
    await roomRepo.touch(room);

    // Was this browser previously here under a different socket?
    let reconnectedFrom = null;
    /*
     * The score owed to this browser, taken off its session. Only a join the
     * resume guard below accepts reads it, so a takeover cannot inherit one.
     */
    let carriedScore = 0;
    if (isValidSessionId(sessionId)) {
        const { socketId: holder, live } = await sessionHolder(sessionId);

        /*
         * A session whose socket is STILL CONNECTED is being taken, not
         * returned to: the id is the only credential, so anyone holding one
         * could evict the player using it. Every genuine return (reload,
         * dropped network, closed tab) leaves that socket disconnected. The
         * second client still joins, as itself.
         */
        if (!(live && holder !== socketId)) {
            if (holder && holder !== socketId) {
                reconnectedFrom = holder;
                await playerRepo.remove(holder);
            }
            /*
             * Taken BEFORE the save below rewrites the session hash, and
             * against the run being rejoined: a stash from before a reset
             * belongs to no current game.
             */
            const run = (await roomRepo.getField(room, 'startedAt')) || '';
            carriedScore = await sessionRepo.takeScore(sessionId, room, run);
            await sessionRepo.save(sessionId, { room, name, socketId });
        }
    }

    const playerExists = await playerRepo.exists(socketId);
    if (!playerExists) {
        await playerRepo.create(socketId, { room, name, sessionId, avatar: storedAvatar });
    } else {
        // Rejoining under a different name is allowed; the avatar overwrites too, '' included.
        await playerRepo.setFields(socketId, {
            room,
            name,
            avatar: storedAvatar,
            sessionId: sessionId || '',
        });
    }

    /*
     * Everything else a reconnect carries across is below; the score is the
     * one thing that outlived nothing, so it comes back from the session.
     */
    if (carriedScore) await playerRepo.setScore(socketId, carriedScore);

    const roomState = await roomRepo.getState(room);
    const mode = roomState.mode || 'co-op';

    // A reconnecting host keeps the host role.
    if (reconnectedFrom && roomState.hostSocket === reconnectedFrom) {
        await roomRepo.setFields(room, { hostSocket: socketId });
    }

    /*
     * Sent to the ARRIVAL, not the room: re-broadcasting would re-open
     * everyone's summary and confetti on every reload.
     */
    if (roomState.gameWon === "true") {
        io.to(socketId).emit(SERVER_EVENTS.GAME_WON);
    }

    if (roomState.gameOver === "true") {
        const gameOverName = roomState.gameOverName || "Someone";
        io.to(socketId).emit(SERVER_EVENTS.GAME_OVER, gameOverName);
    }

    const roomPlayers = roomRepo.playersFrom(roomState);

    if (reconnectedFrom && roomPlayers.includes(reconnectedFrom)) {
        // Take the old socket's slot; in PVP an extra player would be rejected.
        roomPlayers[roomPlayers.indexOf(reconnectedFrom)] = socketId;
        await roomRepo.setPlayers(room, roomPlayers);
    } else if (!roomPlayers.includes(socketId)) {
        roomPlayers.push(socketId);
        await roomRepo.setPlayers(room, roomPlayers);
    }

    // A late join or reconnect picks up the running clock, which is why it is stored as timestamps.
    io.to(socketId).emit(SERVER_EVENTS.GAME_CLOCK, clockOf(roomState));

    // Co-op only; PVP boards are sent when the game starts.
    if (mode === 'co-op') {
        const board = JSON.parse(roomState.board);
        // Mines show only for a finished game; mid-game a joiner could read the layout and leave.
        const isOver = roomState.gameOver === 'true' || roomState.gameWon === 'true';
        io.to(room).emit(SERVER_EVENTS.BOARD_UPDATE, projectBoard(board, { revealMines: isOver }));
    } else if (mode === 'pvp') {
        const restored = reconnectedFrom
            ? await restorePvpRacer(room, socketId, roomState, reconnectedFrom)
            : false;

        if (!restored) {
            // Nothing in flight for this socket: the lobby's empty board.
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
        // Room already gone; just clean up the player.
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

        // Kept briefly so a dropped player can reconnect straight back.
        if (playersInRoom.length === 0) {
            await roomRepo.startGracePeriod(room);
        } else {
            // A reload is a disconnect too, so the forfeit waits; see pvpForfeit.js.
            if (mode === 'pvp' && roomState.pvpStarted === 'true' && !roomState.winnerSocket) {
                const player1Won = roomState.player1GameWon === 'true';
                const player2Won = roomState.player2GameWon === 'true';
                if (!player1Won && !player2Won) {
                    scheduleForfeit(room, playersInRoom[0]);
                }
            }

            // Dropping out of the lobby puts the survivor back in the waiting state.
            if (mode === 'pvp' && roomState.pvpStarted !== 'true') {
                const remainingPlayer = playersInRoom[0];

                if (roomState.hostSocket === socketId) {
                    await roomRepo.setFields(room, { hostSocket: remainingPlayer });
                    io.to(remainingPlayer).emit(SERVER_EVENTS.PVP_HOST_TRANSFERRED);
                }

                io.to(remainingPlayer).emit(SERVER_EVENTS.PVP_OPPONENT_LEFT_BEFORE_START);
            }

            await updatePlayerStatsInRoom(room);
            // Clears this player's hover on everyone else's board.
            socket.to(room).emit(SERVER_EVENTS.PLAYER_LEFT, socketId);
        }
    }
    socket.leave(room);

    /*
     * Keep the score for a reload, but only for a session that could still
     * resume INTO this room on this socket, which is what `offerResume` will
     * ask. A deliberate leave reaches here too, after `playerLeave` ran
     * forgetRoom; a stash then would let the leaver walk back in on their old
     * score. The socket check stops a second tab on the same session banking
     * ITS score. The run stamp keeps the score to the game it was earned in;
     * see `stashScore`.
     */
    const sessionId = await playerRepo.getField(socketId, 'sessionId');
    if (sessionId) {
        const score = await playerRepo.getScore(socketId);
        const session = await sessionRepo.getState(sessionId);
        const resumable = session.room === room && session.socketId === socketId;
        const run = roomState.startedAt || '';
        if (score > 0 && resumable) await sessionRepo.stashScore(sessionId, { room, score, run });
    }

    await playerRepo.remove(socketId);
}

module.exports = { updatePlayerStatsInRoom, resetPlayerScores, addPlayerToRoom, removePlayer };