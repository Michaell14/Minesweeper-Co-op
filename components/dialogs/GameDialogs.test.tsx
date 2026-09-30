// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, within } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS } from '@/lib/dialogs';
import GameDialogs from './GameDialogs';

vi.mock('@/components/game/GameSummary', () => ({ default: () => <div>Summary</div> }));

beforeEach(() => {
    useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true);
    useMinesweeperStore.setState({ mode: 'pvp', pvpStarted: true });
});

const renderDialogs = () => {
    const actions = { resetGame: vi.fn(), resetMyBoard: vi.fn(), pvpRematch: vi.fn(), addRoomFriend: vi.fn() };
    render(<GameDialogs {...actions} />);
    // jsdom lacks native method="dialog" submission; browser smoke verifies closing.
    document.querySelectorAll('dialog form').forEach((form) =>
        form.addEventListener('submit', (event) => event.preventDefault()));
    return actions;
};
const dialog = (id: string) => {
    const element = document.getElementById(id)!;
    element.setAttribute('open', '');
    return within(element);
};

test('a mine-hit dialog can retry directly without first finding the board controls', () => {
    useMinesweeperStore.setState({ gameOver: true });
    const actions = renderDialogs();
    const retry = dialog(DIALOGS.pvpGameOver).getByRole('button', { name: 'Try again' });
    expect(retry.getAttribute('type')).toBe('submit');
    fireEvent.click(retry);
    expect(actions.resetMyBoard).toHaveBeenCalledOnce();
});

test('a decided race no longer offers the mid-race retry', () => {
    useMinesweeperStore.setState({ pvpWinner: 'Rival', gameOver: true });
    renderDialogs();
    expect(dialog(DIALOGS.pvpGameOver).queryByRole('button', { name: 'Try again' })).toBeNull();
});

test.each([DIALOGS.pvpYouWon, DIALOGS.pvpOpponentWon])('the host can rematch directly from %s', (id) => {
    useMinesweeperStore.setState({
        pvpWinner: 'Player', pvpIsHost: true,
        playerStatsInRoom: [{ name: 'Player', score: 10 }, { name: 'Rival', score: 5 }],
    });
    const actions = renderDialogs();
    const rematch = dialog(id).getByRole('button', { name: 'Rematch' });
    expect(rematch.getAttribute('type')).toBe('submit');
    fireEvent.click(rematch);
    expect(actions.pvpRematch).toHaveBeenCalledOnce();
});

test('the guest sees who can start the next race', () => {
    useMinesweeperStore.setState({
        pvpWinner: 'Player', pvpIsHost: false,
        playerStatsInRoom: [{ name: 'Player', score: 10 }, { name: 'Rival', score: 5 }],
    });
    renderDialogs();
    const result = dialog(DIALOGS.pvpYouWon);
    expect(result.queryByRole('button', { name: 'Rematch' })).toBeNull();
    expect(result.getByRole('status').textContent).toContain('Waiting for the host');
});

test('a forfeit with no opponent does not offer a rematch that cannot start', () => {
    useMinesweeperStore.setState({ pvpWinner: 'Player', pvpIsHost: true, playerStatsInRoom: [{ name: 'Player', score: 0 }] });
    renderDialogs();
    const result = dialog(DIALOGS.pvpOpponentDisconnected);
    expect(result.queryByRole('button', { name: 'Rematch' })).toBeNull();
    expect(result.getByRole('status').textContent).toContain('Invite another player');
});

test('a surviving guest is directed to a new race when the host has left', () => {
    useMinesweeperStore.setState({ pvpWinner: 'Player', pvpIsHost: false, playerStatsInRoom: [{ name: 'Player', score: 0 }] });
    renderDialogs();
    const result = dialog(DIALOGS.pvpOpponentDisconnected);
    expect(result.queryByRole('button', { name: 'Rematch' })).toBeNull();
    expect(result.getByRole('status').textContent).toContain('create a new race');
});
