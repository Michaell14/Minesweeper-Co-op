// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { track } from '@vercel/analytics';
import {
    boardProperties, confirmDailyStart, finishMeasuredGame, forgetMeasuredGame,
    requestDailyStart, requestPlay, resolvePlay, sanitizeAnalyticsEvent,
    startMeasuredGame, trackUsage, type BoardProperties,
} from './analytics';

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }));
const board: BoardProperties = { mode: 'co-op', rows: 16, cols: 16, mines: 40, rules: 'standard' };
beforeEach(() => vi.mocked(track).mockReset());
afterEach(() => vi.useRealTimers());

test('removes invite codes, callback URLs and fragments from both event types', () => {
    for (const type of ['pageview', 'event'] as const) {
        expect(sanitizeAnalyticsEvent({ type, url: 'https://www.minesweepercoop.com/?room=private&callbackUrl=secret#token' }))
            .toEqual({ type, url: 'https://www.minesweepercoop.com/' });
    }
    expect(sanitizeAnalyticsEvent({ type: 'pageview', url: 'https://www.minesweepercoop.com/api/auth/signin?code=secret' })).toBeNull();
    expect(sanitizeAnalyticsEvent({ type: 'event', url: 'broken' })).toBeNull();
});

test('match reconnects count once, and the result records a bounded wait bucket', () => {
    vi.useFakeTimers();
    const session = {};
    requestPlay(session, 'quick_match');
    vi.advanceTimersByTime(6500);
    requestPlay(session, 'quick_match');
    resolvePlay(session, 'entered', { ...board, mode: 'pvp', rules: 'race' });
    resolvePlay(session, 'entered', board);
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('play_result', {
        ...board, mode: 'pvp', rules: 'race', action: 'quick_match', outcome: 'entered', wait: '5-14s',
    });
});

test('automatic restores and errors without a user request do not invent conversions', () => {
    resolvePlay({}, 'entered', board);
    resolvePlay({}, 'error');
    expect(track).not.toHaveBeenCalled();
});

test('switching to practice closes the match search, then measures practice separately', () => {
    const session = {};
    requestPlay(session, 'quick_match');
    resolvePlay(session, 'practice');
    requestPlay(session, 'practice');
    resolvePlay(session, 'entered', { ...board, mode: 'practice', rules: 'race' });
    expect(vi.mocked(track).mock.calls.map(([event, props]) => [event, props?.action, props?.outcome]))
        .toEqual([
            ['play_requested', 'quick_match', undefined], ['play_result', 'quick_match', 'practice'],
            ['play_requested', 'practice', undefined], ['play_result', 'practice', 'entered'],
        ]);
});

test('run snapshots and duplicate results cannot inflate completions', () => {
    const session = {};
    finishMeasuredGame(session, 'won');
    startMeasuredGame(session, 1000, board);
    startMeasuredGame(session, 1000, board);
    finishMeasuredGame(session, 'lost');
    finishMeasuredGame(session, 'lost');
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('game_finished', { ...board, result: 'lost' });
});

test('daily starts require a server response, and leaving discards pending starts', () => {
    const session = {};
    requestDailyStart(session, 1000, { ...board, mode: 'daily', rules: 'daily' });
    expect(track).not.toHaveBeenCalled();
    confirmDailyStart(session);
    confirmDailyStart(session);
    expect(track).toHaveBeenCalledTimes(1);
    requestDailyStart(session, 2000, board);
    forgetMeasuredGame(session);
    confirmDailyStart(session);
    finishMeasuredGame(session, 'won');
    expect(track).toHaveBeenCalledTimes(1);
});

test('an analytics failure cannot break gameplay', () => {
    vi.mocked(track).mockImplementationOnce(() => { throw new Error('unavailable'); });
    trackUsage('play_requested', { action: 'join' });
    expect(track).toHaveBeenCalledOnce();
});

test('uses the actual dimensions and rules, including practice and daily', () => {
    const state = { mode: 'co-op' as const, numRows: 9, numCols: 12, numMines: 20, relaxed: false, dailyActive: false, practiceTargetMs: null };
    expect(boardProperties(state)).toEqual({ mode: 'co-op', rows: 9, cols: 12, mines: 20, rules: 'sudden_death' });
    expect(boardProperties({ ...state, practiceTargetMs: 60000 })).toMatchObject({ mode: 'practice', rules: 'race' });
    expect(boardProperties({ ...state, dailyActive: true, practiceTargetMs: 60000 })).toMatchObject({ mode: 'daily', rules: 'daily' });
});
