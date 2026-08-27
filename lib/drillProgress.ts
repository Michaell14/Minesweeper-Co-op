/**
 * Which drills this browser has solved. localStorage only — guests are the
 * majority here and must keep progress. Untrusted input: a stale or
 * hand-edited blob degrades to "no progress", never a throw on page load.
 */

export const DRILL_PROGRESS_KEY = 'ms-drills';

export interface DrillProgress {
    version: 1;
    /** Drill ids solved at least once. */
    completed: string[];
    /** Solved with zero mistakes. Once earned, never taken back. */
    perfect: string[];
}

const empty = (): DrillProgress => ({ version: 1, completed: [], perfect: [] });

const ids = (value: unknown): string[] =>
    Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string'))] : [];

export function sanitizeProgress(raw: unknown): DrillProgress {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return empty();
    const blob = raw as Record<string, unknown>;
    return { version: 1, completed: ids(blob.completed), perfect: ids(blob.perfect) };
}

export function readProgress(): DrillProgress {
    if (typeof window === 'undefined') return empty();
    try {
        const raw = window.localStorage.getItem(DRILL_PROGRESS_KEY);
        return raw === null ? empty() : sanitizeProgress(JSON.parse(raw));
    } catch {
        return empty();
    }
}

export function recordSolved(id: string, mistakes: number): DrillProgress {
    const next = readProgress();
    if (!next.completed.includes(id)) next.completed.push(id);
    if (mistakes === 0 && !next.perfect.includes(id)) next.perfect.push(id);
    try {
        window.localStorage.setItem(DRILL_PROGRESS_KEY, JSON.stringify(next));
    } catch {
        // A browser refusing storage still gets to play the drill.
    }
    return next;
}
