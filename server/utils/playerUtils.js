const { io } = require('./initializeClient');
const { redisClient } = require('./initializeRedisClient');

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

const addPlayerToRoom = async (room, socketId, name) => {
    const client = await redisClient;
    const playerExists = await client.exists(`player:${socketId}`);
    if (!playerExists) {
        await client.hSet(`player:${socketId}`, {
            room: room,
            name: name,
            score: "0"
        })
        await client.expire(`player:${socketId}`, 86400); // Deletes a user after a day
    } else {
        // Update room and name (in case player rejoins with different name)
        await client.hSet(`player:${socketId}`, {
            "room": room,
            "name": name
        });
    }

    // Add the player to the room
    const roomState = await client.hGetAll(`room:${room}`);

    if (roomState.gameWon === "true") {
        io.to(room).emit("gameWon");
    }

    if (roomState.gameOver === "true") {
        // Get the name of whoever hit the mine (stored in room state or empty)
        const gameOverName = roomState.gameOverName || "Someone";
        io.to(room).emit("gameOver", gameOverName);
    }

    const roomPlayers = JSON.parse(roomState.players);

    // Only add player if not already in the room (prevent duplicates on reconnect)
    if (!roomPlayers.includes(socketId)) {
        roomPlayers.push(socketId);

        // Save the updated players array back to Redis
        await client.hSet(`room:${room}`, { players: JSON.stringify(roomPlayers) });
    }

    // Send the current board to the player who joined
    const board = JSON.parse(roomState.board);
    io.to(room).emit('boardUpdate', board);
    await updatePlayerStatsInRoom(room);
}

const removePlayer = async (socket, socketId) => {
    const client = await redisClient;
    const playerExists = await client.exists(`player:${socketId}`);
    if (!playerExists) return;

    const room = await client.hGet(`player:${socketId}`, 'room');
    if (!room) return;

    const playersData = await client.hGet(`room:${room}`, "players");
    if (!playersData) {
        // Room already deleted, just clean up player
        socket.leave(room);
        await client.del(`player:${socketId}`);
        return;
    }

    const playersInRoom = JSON.parse(playersData);

    if (playersInRoom && playersInRoom.includes(socketId)) {
        const index = playersInRoom.indexOf(socketId); // Find the index of the element
        if (index > -1) {
            playersInRoom.splice(index, 1);
        }

        // If the room is empty, delete it immediately
        if (playersInRoom.length === 0) {
            await client.del(`room:${room}`);
        } else {
            // Only update the room and stats if it still has players
            await client.hSet(`room:${room}`, { "players": JSON.stringify(playersInRoom) });
            await updatePlayerStatsInRoom(room);
            // Notify other players to remove this player's hover
            socket.to(room).emit("playerLeft", socketId);
        }
    }
    socket.leave(room);
    await client.del(`player:${socketId}`);
}

module.exports = { updatePlayerStatsInRoom, resetPlayerScores, addPlayerToRoom, removePlayer };