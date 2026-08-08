/**
 * Display formatting for server TIMESTAMPS — an achievement's `earnedAt`, a
 * board best's `achievedAt`, a recent game's `finishedAt`.
 *
 * Not for the 'YYYY-MM-DD' day strings the daily challenge keys on: those are
 * UTC calendar days, and local-parsing one shifts it a day west (see
 * lib/dailyCalendar.ts). A timestamp is a real instant, so rendering it in the
 * reader's timezone is the correct thing to do — which is exactly why the two
 * cases must not share a helper.
 */
export const formatDate = (iso: string): string => new Date(iso).toLocaleDateString();
