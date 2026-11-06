/**
 * Mode dispatch for cell actions: the only place that decides co-op vs PVP.
 * Every action runs under a lock (overlapping board writes erase each other);
 * co-op's is per ROOM, PVP's per PLAYER so the racers are not serialised. State
 * read before the lock is stale, so nothing is read before it but the mode
 * (and in PVP the player's slot, which picks the lock key); the room hash is
 * read once, inside the lock, and THAT snapshot goes to the mode module.
 */

const coop = require('./coop');
const pvp = require('./pvp');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { pvpIndexOf } = require('../domain/pvpPlayer');

/** Rooms created before `mode` existed have no such field; those are co-op. */
const modeOf = (roomState) => (roomState && roomState.mode) || 'co-op';

/**
 * The mode alone, which is all dispatch needs. Not the whole hash: that holds
 * every board in the room (three in PVP), and the move reads it again under
 * its lock anyway.
 */
const readMode = async (room) => modeOf({ mode: await roomRepo.getField(room, 'mode') });

/**
 * Runs a PVP move under that player's lock with room state read inside.
 * The index alone is safe to read before the lock: startPvpGame writes it once
 * and it picks the lock key. No index means no lock and no board; pvp.js refuses.
 */
const withPvpMove = async (room, socketId, run) => {
    const playerIndex = pvpIndexOf(await playerRepo.getState(socketId));
    if (playerIndex === null) return await run(await roomRepo.getState(room));

    return await roomRepo.withPvpActionLock(room, playerIndex, socketId, async () =>
        await run(await roomRepo.getState(room)));
};

const openCell = async (row, col, room, socketId) => {
    if ((await readMode(room)) === 'pvp') {
        const playerData = await playerRepo.getState(socketId);
        const playerIndex = pvpIndexOf(playerData);
        if (playerIndex === null) {
            const [roomState, playerScore] = await Promise.all([
                roomRepo.getState(room),
                playerRepo.getField(socketId, 'score'),
            ]);
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
    if ((await readMode(room)) === 'pvp') {
        return await withPvpMove(room, socketId, (fresh) =>
            pvp.chordCell(row, col, room, socketId, fresh));
    }

    return await roomRepo.withActionLock(room, socketId, async () =>
        await coop.chordCell(row, col, room, socketId, await roomRepo.getState(room)));
};

const toggleFlag = async (row, col, room, socketId) => {
    if ((await readMode(room)) === 'pvp') {
        return await withPvpMove(room, socketId, (fresh) =>
            pvp.toggleFlag(row, col, room, socketId, fresh));
    }

    return await roomRepo.withActionLock(room, socketId, async () =>
        await coop.toggleFlag(row, col, room, socketId, await roomRepo.getState(room)));
};

module.exports = { openCell, chordCell, toggleFlag, modeOf };
