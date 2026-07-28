const { io } = require('./initializeClient');
const { createEmptyBoard, projectBoard } = require('../domain/board');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const sessionRepo = require('../data/sessionRepo');

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

    io.to(room).emit("playerStatsUpdate", updatedStats);
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

    if (roomState.gameWon === "true") {
        io.to(room).emit("gameWon");
    }

    if (roomState.gameOver === "true") {
        // Get the name of whoever hit the mine (stored in room state or empty)
        const gameOverName = roomState.gameOverName || "Someone";
        io.to(room).emit("gameOver", gameOverName);
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

    // Send the current board to the player who joined (only for co-op)
    // For PVP, boards are sent when game starts
    if (mode === 'co-op') {
        const board = JSON.parse(roomState.board);
        // Someone joining a finished game should see the mines; mid-game they
        // must not. Without this a player could join, read the layout, and leave.
        const isOver = roomState.gameOver === 'true' || roomState.gameWon === 'true';
        io.to(room).emit('boardUpdate', projectBoard(board, { revealMines: isOver }));
    } else if (mode === 'pvp') {
        // For PVP, send empty board to show UI
        const numRows = parseInt(roomState.numRows, 10);
        const numCols = parseInt(roomState.numCols, 10);
        const emptyBoard = createEmptyBoard(numRows, numCols);
        io.to(socketId).emit('boardUpdate', emptyBoard);
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
            // Handle PVP disconnection - award win to remaining player if game is in progress
            if (mode === 'pvp' && roomState.pvpStarted === 'true' && !roomState.winnerSocket) {
                const remainingPlayer = playersInRoom[0];

                // Check if game hasn't already ended
                const player1Won = roomState.player1GameWon === 'true';
                const player2Won = roomState.player2GameWon === 'true';

                if (!player1Won && !player2Won) {
                    // Get the remaining player's name
                    const remainingPlayerName = await playerRepo.getName(remainingPlayer);

                    // Mark the remaining player as winner
                    await roomRepo.setFields(room, {
                        winnerSocket: remainingPlayer
                    });

                    // Notify the remaining player that they won due to opponent disconnect
                    io.to(remainingPlayer).emit('pvpOpponentDisconnected', {
                        winnerSocket: remainingPlayer,
                        winnerName: remainingPlayerName
                    });
                }
            }

            // Handle PVP disconnection before game starts - reset room ready state
            if (mode === 'pvp' && roomState.pvpStarted !== 'true') {
                const remainingPlayer = playersInRoom[0];

                // If the leaving player was the host, transfer host to remaining player
                if (roomState.hostSocket === socketId) {
                    await roomRepo.setFields(room, { hostSocket: remainingPlayer });
                    io.to(remainingPlayer).emit('pvpHostTransferred');
                }

                // Notify remaining player to go back to waiting state
                io.to(remainingPlayer).emit('pvpOpponentLeftBeforeStart');
            }

            await updatePlayerStatsInRoom(room);
            // Notify other players to remove this player's hover
            socket.to(room).emit("playerLeft", socketId);
        }
    }
    socket.leave(room);
    await playerRepo.remove(socketId);
}

module.exports = { updatePlayerStatsInRoom, resetPlayerScores, addPlayerToRoom, removePlayer };