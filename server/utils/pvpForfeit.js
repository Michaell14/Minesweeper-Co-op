/**
 * Losing a race by walking away — but not by pressing refresh.
 *
 * Dropping out hands the win to whoever is left, which is right when someone
 * quits and wrong when their tab reloaded, and both arrive as a disconnect. So
 * the decision waits.
 *
 * The wait needs no cancellation: when the timer fires it just looks at the room
 * again, and a player who came back is in it. Hence "is the room whole again?"
 * rather than a flag someone has to remember to clear.
 *
 * The timer is in memory, the honest trade for a single-process server — a
 * restart mid-window means no forfeit is awarded and the race carries on with
 * one player, a far cheaper failure than wrongly ending someone's game.
 */

const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { pvpPlayerFields } = require('../data/keys');
const { io } = require('../utils/initializeClient');
const { SERVER_EVENTS } = require('../../shared/events');
const { PVP_RECONNECT_GRACE_MS } = require('../config');
const { readStamp } = require('../domain/clock');

/** Awards the race to `survivor` unless the room filled back up meanwhile. */
const settleForfeit = async (room, survivor) => {
    const roomState = await roomRepo.getState(room);
    if (!roomState || !roomState.players) return false;

    // Someone already won it outright while the clock ran down.
    if (roomState.winnerSocket) return false;
    if (roomState.player1GameWon === 'true' || roomState.player2GameWon === 'true') return false;

    // They came back. This is the whole point of waiting.
    if (roomRepo.playersFrom(roomState).length > 1) return false;

    /*
     * Being the last one here is not the same as having won. A player sitting on
     * a board they detonated was told "Boom!" and offered a reset; handing them
     * "Victory!" on top of that contradicts their own screen. Their reset clears
     * `gameOver`, so finishing the board still wins it the ordinary way.
     */
    const slot = roomRepo.pvpSlotOf(roomState, survivor);
    if (slot !== undefined && roomState[pvpPlayerFields(slot).gameOverKey] === 'true') return false;

    await roomRepo.setFields(room, { winnerSocket: survivor });

    // Winning by default still ends the race, so the clock stops.
    io.to(survivor).emit(SERVER_EVENTS.GAME_CLOCK, {
        startedAt: readStamp(roomState.startedAt),
        endedAt: Date.now(),
    });

    io.to(survivor).emit(SERVER_EVENTS.PVP_OPPONENT_DISCONNECTED, {
        winnerSocket: survivor,
        winnerName: (await playerRepo.getName(survivor)) || 'You',
    });

    return true;
};

/**
 * Starts the countdown after a racer drops out.
 *
 * Returns the timer so tests can await the same delay deterministically rather
 * than sleeping; nothing in the server needs to hold onto it.
 */
const scheduleForfeit = (room, survivor, delayMs = PVP_RECONNECT_GRACE_MS) => {
    const timer = setTimeout(() => {
        settleForfeit(room, survivor).catch((error) =>
            console.error('Error settling PVP forfeit:', error)
        );
    }, delayMs);

    // A pending forfeit should never be the reason the process stays alive.
    if (typeof timer.unref === 'function') timer.unref();
    return timer;
};

module.exports = { scheduleForfeit, settleForfeit };
