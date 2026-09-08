/**
 * Losing a race by walking away, but not by pressing refresh. A quit and a
 * reload both arrive as a disconnect, so the decision waits. No cancellation
 * needed: the timer re-reads the room, and a player who came back is in it.
 * The timer is in memory; a restart mid-window awards no forfeit, a far
 * cheaper failure than wrongly ending someone's game.
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
     * Last one here is not the same as having won: a player told "Boom!" and
     * offered a reset must not also be told "Victory!". Their reset clears
     * `gameOver`, so finishing the board still wins the ordinary way.
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

/** Starts the countdown. Returns the timer so tests can await the delay deterministically. */
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
