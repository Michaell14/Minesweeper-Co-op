/**
 * All player reads and writes. Keyed by socket id, so a reconnect creates a
 * NEW record: scores and PVP indices do not survive one.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { playerKey, PLAYER_TTL_SECONDS } = require('./keys');

const exists = async (socketId) => {
    const client = await redisClient;
    return await client.exists(playerKey(socketId));
};

/** The whole player hash. Returns {} for an unknown player. */
const getState = async (socketId) => {
    const client = await redisClient;
    return await client.hGetAll(playerKey(socketId));
};

const getField = async (socketId, field) => {
    const client = await redisClient;
    return await client.hGet(playerKey(socketId), field);
};

const setFields = async (socketId, fields) => {
    const client = await redisClient;
    return await client.hSet(playerKey(socketId), fields);
};

const remove = async (socketId) => {
    const client = await redisClient;
    return await client.del(playerKey(socketId));
};

/** Creates the record and starts its 24h expiry. `avatar` is '' for anonymous. */
const create = async (socketId, { room, name, sessionId, avatar }) => {
    const client = await redisClient;
    await client.hSet(playerKey(socketId), {
        room,
        name,
        avatar: avatar || '',
        score: '0',
        sessionId: sessionId || '',
    });
    await client.expire(playerKey(socketId), PLAYER_TTL_SECONDS);
};

const getName = (socketId) => getField(socketId, 'name');
const getRoom = (socketId) => getField(socketId, 'room');

/** Avatar id, or null — '' (anonymous) and a missing record both read as null. */
const getAvatar = async (socketId) => (await getField(socketId, 'avatar')) || null;

/** Score as a number; anything unparseable reads as 0. */
const getScore = async (socketId) => parseInt((await getField(socketId, 'score')) || '0', 10) || 0;

const setScore = (socketId, score) => setFields(socketId, { score: score.toString() });

const resetScore = (socketId) => setFields(socketId, { score: '0' });

module.exports = {
    exists,
    getState,
    getField,
    setFields,
    remove,
    create,
    getName,
    getRoom,
    getAvatar,
    getScore,
    setScore,
    resetScore,
};
