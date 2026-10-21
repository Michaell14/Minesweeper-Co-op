import { track, type BeforeSend } from '@vercel/analytics';

/** Fixed event schemas keep player text, room codes and credentials out of analytics. */
export interface BoardProperties {
    mode: 'co-op' | 'pvp' | 'practice' | 'daily';
    rows: number;
    cols: number;
    mines: number;
    rules: 'standard' | 'sudden_death' | 'race' | 'daily';
}

export type PlayAction = 'create' | 'join' | 'quick_match' | 'practice' | 'daily';
type PlayOutcome = 'entered' | 'resumed' | 'cancelled' | 'practice' | 'error' | 'already_played';

export function boardProperties(state: {
    mode: 'co-op' | 'pvp'; numRows: number; numCols: number; numMines: number;
    dailyActive: boolean; practiceTargetMs: number | null; relaxed: boolean;
}): BoardProperties {
    const mode = state.dailyActive ? 'daily' : state.practiceTargetMs !== null ? 'practice' : state.mode;
    return {
        mode, rows: state.numRows, cols: state.numCols, mines: state.numMines,
        rules: mode === 'daily' ? 'daily' : mode === 'pvp' || mode === 'practice' ? 'race' : state.relaxed ? 'standard' : 'sudden_death',
    };
}

interface Events {
    play_requested: { action: PlayAction };
    play_result: { action: PlayAction; outcome: PlayOutcome; wait: string } & Partial<BoardProperties>;
    game_started: BoardProperties;
    game_finished: BoardProperties & { result: 'won' | 'lost' | 'opponent_left' };
    setting_changed: { setting: string; value: string | number | boolean | null };
    room_link_share: { result: 'copied' | 'manual_fallback'; mode: 'co-op' | 'pvp' };
    drill_used: { action: 'started' | 'hint' | 'solved'; lesson: string; drill: string; mistakes?: number; hints?: number };
    connection_problem: { status: 'unreachable' | 'reconnecting' };
}

export function trackUsage<E extends keyof Events>(event: E, properties: Events[E]): void {
    if (typeof window === 'undefined') return;
    try {
        track(event, { ...properties });
    } catch {
        // Telemetry must never interrupt a move, a join, or a settings change.
    }
}

/** Invite links and OAuth query parameters must not become page/event properties. */
export const sanitizeAnalyticsEvent: BeforeSend = (event) => {
    try {
        const url = new URL(event.url);
        if (url.pathname.startsWith('/api/')) return null;
        url.search = '';
        url.hash = '';
        return { ...event, url: url.toString() };
    } catch {
        return null;
    }
};

const waitBucket = (ms: number) => ms < 1000 ? '<1s' : ms < 5000 ? '1-4s' : ms < 15000 ? '5-14s' : ms < 30000 ? '15-29s' : '30s+';
const requests = new WeakMap<object, { action: PlayAction; started: number }>();
const runs = new WeakMap<object, { started: number; board: BoardProperties }>();
const dailyStarts = new WeakMap<object, { started: number; board: BoardProperties }>();

export function requestPlay(session: object, action: PlayAction): void {
    // Re-queuing after reconnect is still the same search.
    if (requests.get(session)?.action === action) return;
    requests.set(session, { action, started: Date.now() });
    trackUsage('play_requested', { action });
}

export function resolvePlay(session: object, outcome: PlayOutcome, board?: BoardProperties): void {
    const request = requests.get(session);
    if (!request) return; // Automatic room restoration is not a new user choice.
    requests.delete(session);
    trackUsage('play_result', { action: request.action, outcome, wait: waitBucket(Date.now() - request.started), ...board });
}

export function startMeasuredGame(session: object, started: number, board: BoardProperties): void {
    if (runs.get(session)?.started === started) return;
    runs.set(session, { started, board });
    trackUsage('game_started', board);
}

export function finishMeasuredGame(session: object, result: 'won' | 'lost' | 'opponent_left'): void {
    const run = runs.get(session);
    if (!run) return; // Ignore terminal snapshots on refresh/join, and duplicate outcomes.
    runs.delete(session);
    trackUsage('game_finished', { ...run.board, result });
}

export function forgetMeasuredGame(session: object): void {
    runs.delete(session);
    dailyStarts.delete(session);
}

/** Daily's clock is optimistic; count a start only after the server returns a board. */
export function requestDailyStart(session: object, started: number, board: BoardProperties): void {
    dailyStarts.set(session, { started, board });
}

export function confirmDailyStart(session: object): void {
    const start = dailyStarts.get(session);
    if (!start) return;
    dailyStarts.delete(session);
    startMeasuredGame(session, start.started, start.board);
}
