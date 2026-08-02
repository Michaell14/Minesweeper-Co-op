/**
 * Mode dispatch for cell actions — the only place that decides whether an action
 * is co-op or PVP.
 *
 * Room state is read here and handed to the mode module, which is why the mode
 * implementations take `roomState` rather than fetching it themselves.
 *
 * Every action is serialised, because both modes rewrite a whole board field and
 * two writes that overlap erase each other — see roomRepo.withActionLock. What
 * differs is the scope: co-op shares one board so the lock is per ROOM, while
 * PVP players own separate board fields and are meant to race, so theirs is per
 * PLAYER. The state read before the mode is known is stale by the time the lock
 * is held, so both paths read again inside it and pass THAT snapshot down.
 */

const coop = require('./coop');
const pvp = require('./pvp');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { pvpIndexOf } = require('../domain/pvpPlayer');

/** Rooms created before `mode` existed have no such field; those are co-op. */
const modeOf = (roomState) => (roomState && roomState.mode) || 'co-op';

/**
 * Runs a PVP move under that player's own lock, handing it room state read
 * inside. For the two actions that need nothing but room state; openCell reads
 * the score and player record as well and so spells it out itself.
 *
 * The index is safe to read BEFORE the lock, unlike everything else here:
 * startPvpGame writes it once and it never changes, which is what lets it pick
 * the lock key. A socket without one gets no lock and no board; pvp.js logs it
 * and refuses the move.
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
        // The score is re-read too, not just the board: two clicks from the same
        // player would otherwise both read the score they started from, and the
        // lost write would take a point with it.
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
