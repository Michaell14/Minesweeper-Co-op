/**
 * Reading the run clock. The server sends two timestamps and the client derives
 * everything from them here, so the live timer and the end-of-game summary
 * cannot disagree on what "elapsed" and "02:07" mean.
 */

/** Seconds since the run began, frozen at `endedAt` once it is set. */
export const elapsedSeconds = (startedAt: number | null, endedAt: number | null, now = Date.now()) =>
    startedAt === null ? 0 : Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000));

/** mm:ss, widening to h:mm:ss only for a run that actually passes an hour. */
export const formatClock = (totalSeconds: number) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const pad = (n: number) => n.toString().padStart(2, '0');
    const hours = Math.floor(s / 3600);
    const body = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
    return hours > 0 ? `${hours}:${body}` : body;
};

/**
 * The same reading for a duration in MILLISECONDS, and without the leading zero
 * on the minutes — "2:05", not "02:05".
 *
 * Two renderings on purpose, and they live together so the difference is a
 * choice rather than a coincidence. `formatClock` drives the ticking timer,
 * which pads so the digits keep a fixed width and do not jump as the minute
 * rolls over. This one goes in prose and in table cells, where a padded minute
 * reads like a typo. Everything that shows a time picks one of these two.
 */
export const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(Math.max(ms, 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};
