// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS } from '@/lib/dialogs';
import JoinRoomForm from './JoinRoomForm';

const openDialog = vi.hoisted(() => vi.fn());
vi.mock('@/lib/dialogs', async () => ({
    ...await vi.importActual<typeof import('@/lib/dialogs')>('@/lib/dialogs'),
    openDialog,
}));

beforeEach(() => {
    useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true);
    window.history.replaceState(null, '', '/');
    openDialog.mockReset();
});

test('a pasted invite link joins its code, preserving case', async () => {
    const joinRoom = vi.fn();
    render(<JoinRoomForm joinRoom={joinRoom} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Room code to join' }), {
        target: { value: ' https://example.com/?room=Calm-Otter ' },
    });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(joinRoom).toHaveBeenCalledOnce());
    expect(useMinesweeperStore.getState().room).toBe('Calm-Otter');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Calm-Otter');
});

test.each(['', '   ', 'x'.repeat(101)])('invalid input shows an inline error before asking for a name', async (value) => {
    render(<JoinRoomForm joinRoom={null} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(openDialog).not.toHaveBeenCalled();
    expect(useMinesweeperStore.getState().room).toBe('');
});

test('an invalid auto-join link shows its error instead of sending a truncated code', async () => {
    window.history.replaceState(null, '', `/?room=${'x'.repeat(101)}`);
    const joinRoom = vi.fn();
    render(<JoinRoomForm joinRoom={joinRoom} />);
    expect(screen.getByRole('alert').textContent).toContain('100 characters or fewer');
    expect(joinRoom).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
});

test('a rejected code takes focus, and fixing it clears the message as you type', async () => {
    render(<JoinRoomForm joinRoom={null} />);
    const field = screen.getByRole('textbox', { name: 'Room code to join' });
    fireEvent.change(field, { target: { value: '   ' } });
    // Nothing is checked before the first submit.
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.submit(screen.getByRole('form'));
    expect((await screen.findByRole('alert')).textContent).toContain('Enter a room code');
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(field.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(field, { target: { value: 'Calm-Otter' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(field.getAttribute('aria-invalid')).toBe('false');
    expect(openDialog).not.toHaveBeenCalled();
});

test('a guest with a valid code is asked for a name, not joined', async () => {
    render(<JoinRoomForm joinRoom={null} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Calm-Otter ' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(openDialog).toHaveBeenCalledWith(DIALOGS.nameJoin));
    expect(useMinesweeperStore.getState().room).toBe('Calm-Otter');
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Calm-Otter');
});
