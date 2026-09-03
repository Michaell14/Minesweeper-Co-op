/**
 * Mode dispatch for cell actions: the only place that decides co-op vs PVP.
 * Every action runs under a lock (overlapping board writes erase each other);
 * co-op's is per ROOM, PVP's per PLAYER so the racers are not serialised. State
 * read before the lock is stale, so both paths re-read inside it and pass THAT
 * snapshot to the mode module.
 */

const coop = require('./coop');
const pvp = require('./pvp');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { pvpIndexOf } = require('../domain/pvpPlayer');

/** Rooms created before `mode` existed have no such field; those are co-op. */
const modeOf = (roomState) => (roomState && roomState.mode) || 'co-op';

/**
 * Runs a PVP move under that player's lock with room state re-read inside.
 * The index alone is safe to read before the lock: startPvpGame writes it once
 * and it picks the lock key. No index means no lock and no board; pvp.js refuses.
 */
const withPvpMove = async (room, socketId, roomState, run) => {
    const playerIndex = pvpIndexOf(await playerRepo.getState(socketId));
    if (playerIndex === null) return await run(roomState);

    return await roomRepo.withPvpActionLock(room, playerIndex, socketId, async () =>
        await run(await roomRepo.getState(room)));
};

const openCell = async (row, col, room, socketId) => {
    const [roomState, playerScore, playerData] = await Promise.all([
        roomRepo.getState(room),
        playerRepo.getField(socketId, "score"),
        playerRepo.getState(socketId),
    ]);

    if (modeOf(roomState) === 'pvp') {
        const playerIndex = pvpIndexOf(playerData);
        if (playerIndex === null) {
            return await pvp.openCell(row, col, room, socketId, roomState, playerScore, playerData);
        }

        return await roomRepo.withPvpActionLock(room, playerIndex, socketId, async () => {
            const [freshState, freshScore, freshPlayer] = await Promise.all([
                roomRepo.getState(room),
                playerRepo.getField(socketId, 'score'),
                playerRepo.getState(socketId),
            ]);
            return await pvp.openCell(row, col, room, socketId, freshState, freshScore, freshPlayer);
        });
    }

    return await roomRepo.withActionLock(room, socketId, async () => {
        // The score is re-read too: two clicks from one player would otherwise lose a point.
        const [freshState, freshScore] = await Promise.all([
            roomRepo.getState(room),
            playerRepo.getField(socketId, 'score'),
        ]);
        return await coop.openCell(row, col, room, socketId, freshState, freshScore);
    });
};

const chordCell = async (row, col, room, socketId) => {
    const roomState = await roomRepo.getState(room);

    if (modeOf(roomState) === 'pvp') {
        return await withPvpMove(room, socketId, roomState, (fresh) =>
            pvp.chordCell(row, col, room, socketId, fresh));
    }

    return await roomRepo.withActionLock(room, socketId, async () =>
        await coop.chordCell(row, col, room, socketId, await roomRepo.getState(room)));
};

const toggleFlag = async (row, col, room, socketId) => {
    const roomState = await roomRepo.getState(room);

    if (modeOf(roomState) === 'pvp') {
        return await withPvpMove(room, socketId, roomState, (fresh) =>
            pvp.toggleFlag(row, col, room, socketId, fresh));
    }

    return await roomRepo.withActionLock(room, socketId, async () =>
        await coop.toggleFlag(row, col, room, socketId, await roomRepo.getState(room)));
};

module.exports = { openCell, chordCell, toggleFlag, modeOf };
