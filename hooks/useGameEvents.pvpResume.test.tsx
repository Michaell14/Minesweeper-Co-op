// @vitest-environment jsdom
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { useMinesweeperStore } from '@/app/store';
import StatusBanner from '@/components/game/StatusBanner';
import { SERVER_EVENTS as E } from '@/shared/events';
import type { AppSocket } from '@/lib/initSocket';
import { useGameEvents as createGameHandlers } from './useGameEvents';

vi.mock('@/lib/confetti', () => ({ shootConfetti: vi.fn() }));

beforeEach(() => useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true));

const handlers = () => createGameHandlers({ id: 'racer', emit: vi.fn() } as unknown as AppSocket, vi.fn());
const winner = { winnerSocket: 'rival', winnerName: 'Rival' };

test.each(['desktop', 'mobile'] as const)('a completed-race reconnect preserves the %s mine-hit badge and winner', (variant) => {
    const events = handlers();
    events[E.JOIN_ROOM_SUCCESS]!({ room: 'race', mode: 'pvp' });
    events[E.PVP_GAME_STARTED]!({ totalSafeCells: 3 });
    events[E.PVP_GAME_OVER]!();
    events[E.PVP_PLAYER_WON]!(winner);
    render(<StatusBanner startPvpGame={vi.fn()} emitConfetti={vi.fn()} variant={variant} />);
    const badgeName = variant === 'desktop' ? 'You hit a mine' : 'Hit a mine';
    expect(screen.getByRole('status', { name: badgeName })).toBeTruthy();

    act(() => { events[E.SESSION_RESUME]!({ room: 'race', name: 'Racer' }); });
    expect(screen.queryByRole('status', { name: badgeName })).toBeNull();
    act(() => {
        events[E.JOIN_ROOM_SUCCESS]!({ room: 'race', mode: 'pvp' });
        events[E.PVP_GAME_STARTED]!({ totalSafeCells: 3 });
        events[E.PVP_BOARD_UPDATE]!({ board: [], playerIndex: 0, gameOver: true });
        events[E.PVP_PLAYER_WON]!({ ...winner, replay: true });
    });

    expect(screen.getByRole('status', { name: badgeName })).toBeTruthy();
    expect(useMinesweeperStore.getState()).toMatchObject({
        gameOver: true, gameWon: false, pvpWinner: 'Rival', pvpOpponentStatus: 'won',
    });
});

test('a snapshot after a reset clears an earlier mine hit while retaining the completed-race winner', () => {
    const events = handlers();
    events[E.PVP_GAME_OVER]!();
    events[E.PVP_BOARD_UPDATE]!({ board: [], playerIndex: 0, gameOver: false });
    events[E.PVP_PLAYER_WON]!({ ...winner, replay: true });

    expect(useMinesweeperStore.getState()).toMatchObject({ gameOver: false, pvpWinner: 'Rival' });
});

test('ordinary live board updates without a snapshot flag preserve an existing mine hit', () => {
    const events = handlers();
    events[E.PVP_GAME_OVER]!();
    events[E.PVP_PLAYER_WON]!(winner);
    events[E.PVP_BOARD_UPDATE]!({ board: [], playerIndex: 0 });
    expect(useMinesweeperStore.getState().gameOver).toBe(true);
});
