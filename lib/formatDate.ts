/**
 * Display formatting for server TIMESTAMPS (earnedAt, achievedAt, finishedAt).
 * Not for the 'YYYY-MM-DD' day strings the daily keys on: those are UTC
 * calendar days, and local-parsing one shifts it a day west (lib/dailyCalendar.ts).
 */
export const formatDate = (iso: string): string => new Date(iso).toLocaleDateString();
