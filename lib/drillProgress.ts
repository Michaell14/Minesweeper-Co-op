/**
 * Which drills this browser has solved, in localStorage so guests keep
 * progress. A stale or hand-edited blob degrades to "no progress", never a throw.
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

/** A hint counts against perfect the same as a mistake: both mean it was not solved cold. */
export interface Attempt {
    mistakes: number;
    hints: number;
}

export function recordSolved(id: string, attempt: Attempt): DrillProgress {
    const next = readProgress();
    const clean = attempt.mistakes === 0 && attempt.hints === 0;
    if (!next.completed.includes(id)) next.completed.push(id);
    if (clean && !next.perfect.includes(id)) next.perfect.push(id);
    try {
        window.localStorage.setItem(DRILL_PROGRESS_KEY, JSON.stringify(next));
    } catch {
        // A browser refusing storage still gets to play the drill.
    }
    return next;
}
