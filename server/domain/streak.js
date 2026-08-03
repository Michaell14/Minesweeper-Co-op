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

module.exports = { utcDayOf, dayBefore, advanceStreak };
