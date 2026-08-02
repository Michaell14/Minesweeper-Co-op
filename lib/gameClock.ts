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
