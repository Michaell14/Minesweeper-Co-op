/**
 * The play-streak: consecutive UTC days with at least one finished game, any
 * mode, win or loss. Pure, because day-boundary maths gives plausible wrong
 * answers if only observable through a database. Days are 'YYYY-MM-DD' UTC
 * strings, not Dates: pg returns `date` columns as local-midnight Dates, which
 * off-by-one across the boundaries this is about.
 */

/** The UTC day an epoch-ms timestamp falls on. */
const utcDayOf = (epochMs) => new Date(epochMs).toISOString().slice(0, 10);

/** The UTC day before one. String maths via epoch, so month/year roll over. */
const dayBefore = (day) =>
    new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/**
 * The streak after a game on `day`: same day, unchanged; the day after the
 * last, extends; otherwise back to 1. A `day` EARLIER than lastPlayedDay
 * (skew, backfill) leaves the streak alone.
 */
const advanceStreak = ({ currentStreak, bestStreak, lastPlayedDay }, day) => {
    let next;
    if (lastPlayedDay === day) {
        next = Math.max(1, currentStreak);
    } else if (lastPlayedDay === dayBefore(day)) {
        next = currentStreak + 1;
    } else if (lastPlayedDay && lastPlayedDay > day) {
        return { currentStreak, bestStreak, lastPlayedDay };
    } else {
        next = 1;
    }
    return {
        currentStreak: next,
        bestStreak: Math.max(bestStreak, next),
        lastPlayedDay: day,
    };
};

/**
 * Streaks recomputed from the full set of days, newest first. advanceStreak
 * assumes days ARRIVE in order, true for the play streak but not the daily
 * clear streak, which keys on the PUZZLE date and where a leftover attempt can
 * win AFTER a later day recorded (48h TTL). So that one is derived from its
 * calendar table. `daysDesc`: unique days, newest first (the caller's ORDER BY
 * is the contract). Whether the newest run is still alive is the display's
 * question.
 */
const streaksFromDays = (daysDesc) => {
    if (daysDesc.length === 0) {
        return { currentStreak: 0, bestStreak: 0, lastPlayedDay: null };
    }
    let best = 1;
    let run = 1;
    let current = 0;
    for (let i = 1; i <= daysDesc.length; i++) {
        if (i < daysDesc.length && daysDesc[i] === dayBefore(daysDesc[i - 1])) {
            run++;
            continue;
        }
        if (current === 0) current = run; // the first run is the newest
        best = Math.max(best, run);
        run = 1;
    }
    return { currentStreak: current, bestStreak: best, lastPlayedDay: daysDesc[0] };
};

module.exports = { utcDayOf, dayBefore, advanceStreak, streaksFromDays };
