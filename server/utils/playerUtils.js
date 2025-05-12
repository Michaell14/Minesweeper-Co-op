const { io } = require('./initializeClient');
const { redisClient } = require('./initializeRedisClient');

const updatePlayerNamesInRoom = async (room) => {
    if (!room) return;
    const client = await redisClient;
    const playersInRoom = JSON.parse(await client.hGet(`room:${room}`, "players"));

    if (!playersInRoom) return;

    const roomNames = [];
    for (let i = 0; i < playersInRoom.length; i++) {
        const playerState = await client.hGetAll(`player:${playersInRoom[i]}`);
        roomNames.push({
            name: playerState.name,
            score: parseInt(playerState.score)
        });
    }

    io.to(room).emit("playerNamesUpdate", roomNames);
}

const resetPlayerScores = async (room) => {
    if (!room) return;
    const client = await redisClient;
    const playersInRoom = JSON.parse(await client.hGet(`room:${room}`, "players"));

    if (!playersInRoom) return;

    for (let i = 0; i < playersInRoom.length; i++) {
        await client.hSet(`player:${playersInRoom[i]}`, { "score": "0" })
    }
}

const addPlayerToRoom = async (room, socketId, name) => {
    const client = await redisClient;
    const playerExists = await client.exists(`player:${socketId}`);
    if (!playerExists) {
        await client.hSet(`player:${socketId}`, {
            room: "",
            name: name,
            score: "0"
        })
        await client.expire(`player:${socketId}`, 86400); // Deletes a user after a day
    }

    await client.hSet(`player:${socketId}`, { "room": room });

    const roomState = await client.hGetAll(`room:${room}`);
    const roomPlayers = JSON.parse(roomState.players);
    roomPlayers.push(socketId);
    // Save the updated players array back to Redis
    await client.hSet(`room:${room}`, { players: JSON.stringify(roomPlayers) });

    // Send the current board to the player who joined
    const board = JSON.parse(roomState.board);
    io.to(room).emit('boardUpdate', board);

    updatePlayerNamesInRoom(room);
}

const removePlayer = async (socket, socketId) => {
    const client = await redisClient;
    const playerExists = await client.exists(`player:${socketId}`);
    if (!playerExists) return;

    const room = await client.hGet(`player:${socketId}`, 'room');

    const playersInRoom = JSON.parse(await client.hGet(`room:${room}`, "players"));

    if (playersInRoom && playersInRoom.includes(socketId)) {
        const index = playersInRoom.indexOf(socketId); // Find the index of the element
        if (index > -1) {
            playersInRoom.splice(index, 1);
        }

        await client.hSet(`room:${room}`, { "players": JSON.stringify(playersInRoom) });
        // If the room is empty, clean up
        if (playersInRoom.length === 0) {
            await client.del(`room:${room}`);
        }
    }
    updatePlayerNamesInRoom(room);
    socket.leave(room);
    await client.del(`player:${socketId}`);
}

module.exports = { updatePlayerNamesInRoom, resetPlayerScores, addPlayerToRoom, removePlayer };