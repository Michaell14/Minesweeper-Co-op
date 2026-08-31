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
            // '' is how the record stores "anonymous" — the payload says null.
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
 * Puts a returning racer back into a PVP game already in progress.
 *
 * A race is per-player in a way co-op is not: the board, the progress and the
 * win/loss flags all live under this player's slot, and the room addresses that
 * slot by socket id. A reload changes the socket, so the slot has to be
 * repointed or the room is still talking to a socket that no longer exists.
 *
 * What is sent mirrors `startPvpGame`, because the client has to end up in the
 * same state either way.
 *
 * Returns false when there is nothing to restore, so the caller can fall back to
 * the empty board the lobby shows.
 */
const restorePvpRacer = async (room, socketId, roomState, previousSocketId) => {
    if (roomState.pvpStarted !== 'true') return false;

    // The room addresses slots by socket, so the slot is found by who used to
    // hold it — not by the player record, which the reconnect just replaced.
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
     * Rebuild the player's identity from the ROOM: `removePlayer` deleted their
     * old record the moment they dropped, so there is nothing left to copy.
     *
     * `pvpPlayerIndex` is the load-bearing field — pvp.js refuses to act for a
     * socket it cannot place, so without it they get their board back and every
     * click on it is silently ignored.
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

    // pvpStarted first: it is what takes the client out of the lobby, and the
    // board that follows is unusable until it lands.
    io.to(socketId).emit(SERVER_EVENTS.PVP_GAME_STARTED, { totalSafeCells });

    io.to(socketId).emit(SERVER_EVENTS.PVP_BOARD_UPDATE, {
        /*
         * Revealed only once the RACE is over, not merely once this player's
         * run is — the same rule game/pvp.js applies when they detonate, and
         * for the same reason. A racer who has hit a mine can `resetMyBoard`
         * and carry on racing the identical layout, so revealing to them here
         * would just be the die-and-read exploit again with a reload in place
         * of the reset.
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
 * Adds a player to a room, or restores one that reconnected.
 *
 * `sessionId` is the browser's persistent id. When it is supplied and already
 * points at a different socket, this is a reconnect rather than a new player:
 * the old socket's record is dropped and its place in the room is handed to the
 * new socket, so a reload does not leave a ghost behind or lose the host.
 */
const addPlayerToRoom = async (room, socketId, name, sessionId, avatar) => {
    // The avatar arrives from socket.data.user (a connect-time snapshot) —
    // good for the lifetime of a room, and validated here so only catalog ids
    // are ever stored on a player record.
    const storedAvatar = isValidAvatarId(avatar) ? avatar : '';

    // Rejoining cancels any grace period the room was counting down.
    await roomRepo.touch(room);

    // Was this browser previously here under a different socket?
    let reconnectedFrom = null;
    /*
     * The score this browser is owed, taken back off its session. Only a join
     * the resume guard below accepts ever reads it, so a takeover cannot
     * inherit one.
     */
    let carriedScore = 0;
    if (isValidSessionId(sessionId)) {
        const { socketId: holder, live } = await sessionHolder(sessionId);

        /*
         * A session whose socket is STILL CONNECTED is not being returned to,
         * it is being taken. The id is the only credential a resume presents,
         * so anyone who has one could otherwise evict the player using it and
         * inherit their room, name and seat mid-game.
         *
         * Every case this feature exists for — reload, dropped network, closed
         * tab — leaves that socket disconnected, so refusing here costs a
         * genuine return nothing. The second client still joins; it just joins
         * as itself, and the session stays bound to whoever is holding it.
         */
        if (!(live && holder !== socketId)) {
            if (holder && holder !== socketId) {
                reconnectedFrom = holder;
                await playerRepo.remove(holder);
            }
            /*
             * Taken BEFORE the save below, which rewrites the session hash.
             * The disconnect that preceded this put the score here precisely
             * because the player record it used to live on is already gone.
             */
            carriedScore = await sessionRepo.takeScore(sessionId, room);
            await sessionRepo.save(sessionId, { room, name, socketId });
        }
    }

    const playerExists = await playerRepo.exists(socketId);
    if (!playerExists) {
        await playerRepo.create(socketId, { room, name, sessionId, avatar: storedAvatar });
    } else {
        // Rejoining under a different name is allowed. The avatar overwrites
        // too — '' included, so signing out between joins clears it.
        await playerRepo.setFields(socketId, {
            room,
            name,
            avatar: storedAvatar,
            sessionId: sessionId || '',
        });
    }

    /*
     * Everything else about a reconnect is carried across below — the room
     * slot, the host role, the PVP board, the running clock. The score is the
     * one thing that outlived nothing, so it is put back here from the session.
     * updatePlayerStatsInRoom at the end of this function rebroadcasts it.
     */
    if (carriedScore) await playerRepo.setScore(socketId, carriedScore);

    const roomState = await roomRepo.getState(room);
    const mode = roomState.mode || 'co-op';

    // A reconnecting host keeps the host role.
    if (reconnectedFrom && roomState.hostSocket === reconnectedFrom) {
        await roomRepo.setFields(room, { hostSocket: socketId });
    }

    /*
     * Catching the ARRIVAL up on an outcome they missed, so it goes to them and
     * not to the room. Everyone already here saw it happen; re-broadcasting
     * re-opens their end-of-game summary and fires the confetti again — which,
     * now that a reload rejoins automatically, would happen on every refresh.
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

    // Co-op only; PVP boards are sent when the game starts.
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

        // An emptied room is kept briefly rather than deleted, so a player who
        // dropped out can reconnect straight back into it.
        if (playersInRoom.length === 0) {
            await roomRepo.startGracePeriod(room);
        } else {
            // A reload reaches the server as a disconnect too, so the forfeit
            // waits to see whether they come back — see pvpForfeit.js.
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
     * Keep the score for the reload that may follow — but only for a session
     * that could still resume INTO this room on this socket, which is exactly
     * what `offerResume` will ask of it later.
     *
     * The guard is not decoration. A deliberate leave reaches this same
     * function, and `playerLeave` runs forgetRoom FIRST: writing a fresh stash
     * here would rebuild the one that call just dropped, and the leaver would
     * walk back into the room on their old score. Reading the session rather
     * than trusting the call order also keeps the two ends of the rule in one
     * place instead of split across a route.
     *
     * The socket check covers the other direction: a second tab holding the
     * same session id joins as itself, and must not bank ITS score onto the
     * session the first tab is still resuming with.
     */
    const sessionId = await playerRepo.getField(socketId, 'sessionId');
    if (sessionId) {
        const score = await playerRepo.getScore(socketId);
        const session = await sessionRepo.getState(sessionId);
        const resumable = session.room === room && session.socketId === socketId;
        if (score > 0 && resumable) await sessionRepo.stashScore(sessionId, { room, score });
    }

    await playerRepo.remove(socketId);
}

module.exports = { updatePlayerStatsInRoom, resetPlayerScores, addPlayerToRoom, removePlayer };