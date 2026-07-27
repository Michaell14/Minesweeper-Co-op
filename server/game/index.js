/**
 * Mode dispatch for cell actions.
 *
 * This is the only place that decides whether an action is co-op or PVP. It
 * previously lived buried a third of the way into each of openCell, chordCell
 * and toggleFlag inside a single 636-line boardUtils.js, so the two modes'
 * implementations were interleaved and neither could be read on its own.
 *
 * Room state is read once here and handed to the mode module, which is why the
 * mode implementations take `roomState` rather than fetching it themselves. The
 * reads are the same ones the old code performed, in the same order.
 */

const coop = require('./coop');
const pvp = require('./pvp');
const { redisClient } = require('../utils/initializeRedisClient');

/** Rooms created before `mode` existed have no such field; those are co-op. */
const modeOf = (roomState) => (roomState && roomState.mode) || 'co-op';

const openCell = async (row, col, room, socketId) => {
    const client = await redisClient;

    // Fetch room state and board in parallel to save time
    const [roomState, playerScore, playerData] = await Promise.all([
        client.hGetAll(`room:${room}`),
        client.hGet(`player:${socketId}`, "score"), // Retrieves the player score to later increment it
        client.hGetAll(`player:${socketId}`),
    ]);

    if (modeOf(roomState) === 'pvp') {
        return await pvp.openCell(row, col, room, socketId, roomState, playerScore, playerData);
    }

    return await coop.openCell(row, col, room, socketId, roomState, playerScore);
};

const chordCell = async (row, col, room, socketId) => {
    const client = await redisClient;
    const roomState = await client.hGetAll(`room:${room}`);

    if (modeOf(roomState) === 'pvp') {
        return await pvp.chordCell(row, col, room, socketId, roomState);
    }

    return await coop.chordCell(row, col, room, socketId, roomState);
};

const toggleFlag = async (row, col, room, socketId) => {
    const client = await redisClient;
    const roomState = await client.hGetAll(`room:${room}`);

    if (modeOf(roomState) === 'pvp') {
        return await pvp.toggleFlag(row, col, room, socketId, roomState);
    }

    return await coop.toggleFlag(row, col, room, socketId, roomState);
};

module.exports = { openCell, chordCell, toggleFlag, modeOf };
