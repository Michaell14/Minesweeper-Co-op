/**
 * The play-streak: consecutive UTC days with at least one finished game (any
 * mode, win or loss — showing up is the streak). Pure, because day-boundary
 * maths is exactly the kind of logic that produces plausible wrong answers
 * forever if it can only be observed through a database.
 *
 * Days are 'YYYY-MM-DD' strings in UTC throughout. Strings, not Date objects:
 * pg hands `date` columns back as local-midnight JS Dates, which off-by-ones
 * across the very boundaries this module is about.
 */

/** The UTC day an epoch-ms timestamp falls on. */
const utcDayOf = (epochMs) => new Date(epochMs).toISOString().slice(0, 10);

/** The UTC day before one. String maths via epoch, so month/year roll over. */
const dayBefore = (day) =>
    new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/**
 * The streak after a game finishing on `day`.
 *
 * Same day again → unchanged; the day after the last → extends; anything else
 * (first game ever, or a gap) → back to 1. A `day` EARLIER than lastPlayedDay
 * (clock skew, backfill) leaves the streak alone rather than resetting it —
 * an old-looking result must never destroy a live streak.
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
 * Streaks recomputed from the full set of days, newest first.
 *
 * advanceStreak accumulates and assumes days ARRIVE in order — true for the
 * play streak, whose day comes from a monotonic server clock. The daily-clear
 * streak keys on the PUZZLE date instead, and a leftover attempt can win
 * AFTER a later day already recorded (48h attempt TTL); an accumulator can
 * only refuse to go backwards, never repair the gap the ordering opened. So
 * that streak is derived from its calendar table, where arrival order cannot
 * matter.
 *
 * `daysDesc`: unique 'YYYY-MM-DD' strings, newest first (the caller's ORDER
 * BY is the contract). Current = the run ending at the newest day; whether
 * that run is still alive is the DISPLAY's question, not storage's.
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
