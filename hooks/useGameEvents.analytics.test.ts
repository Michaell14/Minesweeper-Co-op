// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { track } from '@vercel/analytics';
import { useMinesweeperStore } from '@/app/store';
import { SERVER_EVENTS } from '@/shared/events';
import type { AppSocket } from '@/lib/initSocket';
import { useGameActions } from './useGameActions';
import { useGameEvents } from './useGameEvents';

vi.mock('@vercel/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/confetti', () => ({ shootConfetti: vi.fn() }));
const state = () => useMinesweeperStore.getState();
const setup = () => {
    const socket = { id: 'private-socket', emit: vi.fn() } as unknown as AppSocket;
    const actions = renderHook(() => useGameActions(socket)).result.current;
    return { actions, events: useGameEvents(socket, actions.leaveRoom) };
};
beforeEach(() => {
    useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true);
    vi.mocked(track).mockReset();
    localStorage.clear();
});

test('request and confirmed room entry form a funnel without player or room identity', () => {
    const { actions, events } = setup();
    act(() => { state().setRoom('private-room'); state().setName('Private player'); actions.createRoom(); });
    events[SERVER_EVENTS.JOIN_ROOM_SUCCESS]!({ room: 'private-room', mode: 'co-op', numRows: 8, numCols: 10, numMines: 10, relaxed: true });
    expect(track).toHaveBeenNthCalledWith(1, 'play_requested', { action: 'create' });
    expect(track).toHaveBeenNthCalledWith(2, 'play_result', {
        action: 'create', outcome: 'entered', wait: '<1s', mode: 'co-op', rows: 8, cols: 10, mines: 10, rules: 'standard',
    });
    expect(JSON.stringify(vi.mocked(track).mock.calls)).not.toMatch(/private-room|Private player|private-socket/);
});

/*
 * The server's real join order (server/utils/playerUtils.js addPlayerToRoom):
 * JOIN_ROOM_SUCCESS first, THEN the clock snapshot, marked `replay`. A test
 * sending the clock first once passed while every reload counted a new game.
 */
type Events = ReturnType<typeof setup>['events'];
const joinWithSnapshot = (events: Events, clock: { startedAt: number | null; endedAt: number | null }, mode: 'co-op' | 'pvp' = 'co-op') => {
    events[SERVER_EVENTS.JOIN_ROOM_SUCCESS]!({ room: 'private-room', mode });
    events[SERVER_EVENTS.GAME_CLOCK]!({ ...clock, replay: true });
};
const tracked = () => vi.mocked(track).mock.calls.map(([event]) => event);

test('reloading into a running game counts no new start', () => {
    const { events } = setup();
    events[SERVER_EVENTS.SESSION_RESUME]!({ room: 'private-room', name: 'Private player' });
    joinWithSnapshot(events, { startedAt: 1000, endedAt: null });
    expect(track).not.toHaveBeenCalled();
});

test('reloading into a finished game counts nothing', () => {
    const { events } = setup();
    events[SERVER_EVENTS.SESSION_RESUME]!({ room: 'private-room', name: 'Private player' });
    joinWithSnapshot(events, { startedAt: 1000, endedAt: 2400 });
    events[SERVER_EVENTS.GAME_WON]!({ replay: true });
    expect(track).not.toHaveBeenCalled();
});

test('a reconnect in the same tab neither re-counts the start nor counts the resumed finish', () => {
    const { events } = setup();
    act(() => { state().setRoom('private-room'); state().setPlayerJoined(true); });
    events[SERVER_EVENTS.GAME_CLOCK]!({ startedAt: 1000, endedAt: null });
    events[SERVER_EVENTS.SESSION_RESUME]!({ room: 'private-room', name: 'Private player' });
    joinWithSnapshot(events, { startedAt: 1000, endedAt: null });
    events[SERVER_EVENTS.GAME_WON]!({});
    expect(tracked()).toEqual(['game_started']);
});

test('joining a game already under way is an entry, not a start', () => {
    const { actions, events } = setup();
    act(() => { state().setRoom('private-room'); state().setName('Private player'); actions.joinRoom(); });
    joinWithSnapshot(events, { startedAt: 1000, endedAt: null });
    expect(tracked()).toEqual(['play_requested', 'play_result']);
});

test('a joiner still counts the start when the game begins after they arrive', () => {
    const { actions, events } = setup();
    act(() => { state().setRoom('private-room'); state().setName('Private player'); actions.joinRoom(); });
    joinWithSnapshot(events, { startedAt: null, endedAt: null });
    events[SERVER_EVENTS.GAME_CLOCK]!({ startedAt: 1000, endedAt: null });
    expect(tracked()).toEqual(['play_requested', 'play_result', 'game_started']);
});

test('reloading a race after your own mine records no phantom start or loss', () => {
    const { events } = setup();
    events[SERVER_EVENTS.SESSION_RESUME]!({ room: 'private-room', name: 'Private player' });
    // The room's running clock, then the racer's own, stopped by the mine.
    joinWithSnapshot(events, { startedAt: 1000, endedAt: null }, 'pvp');
    events[SERVER_EVENTS.GAME_CLOCK]!({ startedAt: 1000, endedAt: 2000, replay: true });
    events[SERVER_EVENTS.PVP_GAME_OVER]!();
    expect(track).not.toHaveBeenCalled();
});

test('a live clock followed by duplicate terminal events counts one game', () => {
    const { events } = setup();
    state().setPlayerJoined(true);
    events[SERVER_EVENTS.GAME_CLOCK]!({ startedAt: 1000, endedAt: null });
    events[SERVER_EVENTS.GAME_CLOCK]!({ startedAt: 1000, endedAt: null });
    events[SERVER_EVENTS.GAME_OVER]!('Private player');
    events[SERVER_EVENTS.GAME_OVER]!('Private player');
    expect(vi.mocked(track).mock.calls.map(([event]) => event)).toEqual(['game_started', 'game_finished']);
    expect(track).toHaveBeenLastCalledWith('game_finished', expect.objectContaining({ result: 'lost' }));
});

test('settings hydration is silent and custom palette names are never sent', () => {
    state().hydrateSettings();
    state().replaceSettings({ ...state().settings, sound: true });
    expect(track).not.toHaveBeenCalled();
    state().setSetting('sound', false);
    state().setSetting('sound', false);
    state().setSetting('theme', 'custom:private-player-name');
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith('setting_changed', { setting: 'theme', value: 'custom' });
});
