const { io } = require('./initializeClient');
const { redisClient } = require('./initializeRedisClient');

// Named TTL constants (in seconds)
const ROOM_TTL_SECONDS = 86400;          // 24 Hours default room TTL
const ROOM_GRACE_PERIOD_SECONDS = 600;    // 10 Minutes grace period on empty room

// Basically updates the player's stats whenever:
// 1) A player joins/leaves the room
// 2) A player increments their score
const updatePlayerStatsInRoom = async (room) => {
    if (!room) return; // Necessary??
    const client = await redisClient;
    const playersInRoom = JSON.parse(await client.hGet(`room:${room}`, "players"));
    if (!playersInRoom) return;

    // Fetch all player data in parallel for better performance
    const playerDataPromises = playersInRoom.map(playerId =>
        client.hGetAll(`player:${playerId}`)
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
    const client = await redisClient;
    const playersInRoom = JSON.parse(await client.hGet(`room:${room}`, "players"));

    if (!playersInRoom) return;

    // Reset all player scores in parallel for better performance
    const resetPromises = playersInRoom.map(playerId =>
        client.hSet(`player:${playerId}`, { "score": "0" })
    );
    await Promise.all(resetPromises);
}

const addPlayerToRoom = async (room, socketId, name, sessionId) => {
    const client = await redisClient;

    // Reset room expiration timer (cancel grace period if room was empty)
    await client.expire(`room:${room}`, ROOM_TTL_SECONDS);

    // Track old socket ID if reconnecting under a new socket connection
    let oldSocketIdToSwap = null;
    if (sessionId) {
        const oldSocketId = await client.hGet(`session:${sessionId}`, 'socketId');
        if (oldSocketId && oldSocketId !== socketId) {
            oldSocketIdToSwap = oldSocketId;
            await client.del(`player:${oldSocketId}`);
        }
        await client.hSet(`session:${sessionId}`, {
            room: room,
            name: name,
            socketId: socketId
        });
        await client.expire(`session:${sessionId}`, ROOM_TTL_SECONDS);
    }

    const playerExists = await client.exists(`player:${socketId}`);
    if (!playerExists) {
        await client.hSet(`player:${socketId}`, {
            room: room,
            name: name,
            score: "0",
            sessionId: sessionId || ""
        });
        await client.expire(`player:${socketId}`, ROOM_TTL_SECONDS);
    } else {
        // Update room and name (in case player rejoins with different name)
        await client.hSet(`player:${socketId}`, {
            "room": room,
            "name": name,
            "sessionId": sessionId || ""
        });
    }

    // Add the player to the room
    const roomState = await client.hGetAll(`room:${room}`);
    const mode = roomState.mode || 'co-op';

    // Transfer host socket if reconnecting host
    if (oldSocketIdToSwap && roomState.hostSocket === oldSocketIdToSwap) {
        await client.hSet(`room:${room}`, { hostSocket: socketId });
    }

    if (roomState.gameWon === "true") {
        io.to(room).emit("gameWon");
    }

    if (roomState.gameOver === "true") {
        // Get the name of whoever hit the mine (stored in room state or empty)
        const gameOverName = roomState.gameOverName || "Someone";
        io.to(room).emit("gameOver", gameOverName);
    }

    const roomPlayers = JSON.parse(roomState.players || '[]');

    // If reconnecting with new socket ID, swap old socket ID with new socket ID
    if (oldSocketIdToSwap && roomPlayers.includes(oldSocketIdToSwap)) {
        const oldIdx = roomPlayers.indexOf(oldSocketIdToSwap);
        roomPlayers[oldIdx] = socketId;
        await client.hSet(`room:${room}`, { players: JSON.stringify(roomPlayers) });
    } else if (!roomPlayers.includes(socketId)) {
        roomPlayers.push(socketId);
        await client.hSet(`room:${room}`, { players: JSON.stringify(roomPlayers) });
    }

    // Send the current board to the player who joined (only for co-op)
    // For PVP, boards are sent when game starts
    if (mode === 'co-op') {
        const board = JSON.parse(roomState.board);
        io.to(room).emit('boardUpdate', board);
    } else if (mode === 'pvp') {
        // For PVP, send empty board to show UI
        const numRows = parseInt(roomState.numRows, 10);
        const numCols = parseInt(roomState.numCols, 10);
        const emptyBoard = Array.from({ length: numRows }, () =>
            Array.from({ length: numCols }, () => ({
                isMine: false,
                isOpen: false,
                isFlagged: false,
                nearbyMines: 0,
            }))
        );
        io.to(socketId).emit('boardUpdate', emptyBoard);
    }

    await updatePlayerStatsInRoom(room);
}

const removePlayer = async (socket, socketId) => {
    const client = await redisClient;
    const playerExists = await client.exists(`player:${socketId}`);
    if (!playerExists) return;

    const room = await client.hGet(`player:${socketId}`, 'room');
    if (!room) return;

    const roomState = await client.hGetAll(`room:${room}`);
    if (!roomState || !roomState.players) {
        // Room already deleted, just clean up player
        socket.leave(room);
        await client.del(`player:${socketId}`);
        return;
    }

    const playersInRoom = JSON.parse(roomState.players || '[]');
    const mode = roomState.mode || 'co-op';

    if (playersInRoom && playersInRoom.includes(socketId)) {
        const index = playersInRoom.indexOf(socketId);
        if (index > -1) {
            playersInRoom.splice(index, 1);
        }

        // Update the room players list
        await client.hSet(`room:${room}`, { "players": JSON.stringify(playersInRoom) });

        // If the room is empty, set a grace period for reconnecting players instead of deleting immediately
        if (playersInRoom.length === 0) {
            await client.expire(`room:${room}`, ROOM_GRACE_PERIOD_SECONDS);
        } else {
            // Handle PVP disconnection - award win to remaining player if game is in progress
            if (mode === 'pvp' && roomState.pvpStarted === 'true' && !roomState.winnerSocket) {
                const remainingPlayer = playersInRoom[0];

                // Check if game hasn't already ended
                const player1Won = roomState.player1GameWon === 'true';
                const player2Won = roomState.player2GameWon === 'true';

                if (!player1Won && !player2Won) {
                    // Get the remaining player's name
                    const remainingPlayerName = await client.hGet(`player:${remainingPlayer}`, 'name');

                    // Mark the remaining player as winner
                    await client.hSet(`room:${room}`, {
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
                    await client.hSet(`room:${room}`, { hostSocket: remainingPlayer });
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
    await client.del(`player:${socketId}`);
}

module.exports = { updatePlayerStatsInRoom, resetPlayerScores, addPlayerToRoom, removePlayer };