/**
 * All player reads and writes.
 *
 * Players are keyed by socket id, so a reconnect creates a NEW player record —
 * scores and PVP indices do not survive one. That is existing behaviour, noted
 * here because it is easy to assume otherwise from the repository name.
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

/** Creates the record and starts its 24h expiry. */
const create = async (socketId, { room, name }) => {
    const client = await redisClient;
    await client.hSet(playerKey(socketId), { room, name, score: '0' });
    await client.expire(playerKey(socketId), PLAYER_TTL_SECONDS);
};

const getName = (socketId) => getField(socketId, 'name');
const getRoom = (socketId) => getField(socketId, 'room');

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
    getScore,
    setScore,
    resetScore,
};
