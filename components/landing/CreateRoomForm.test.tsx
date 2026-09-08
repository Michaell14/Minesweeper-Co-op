// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import CreateRoomForm from './CreateRoomForm';
vi.mock('@/lib/roomCode', () => ({ generateRoomCode: vi.fn(() => 'fresh-canyon') }));
beforeEach(() => useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true));

test('defaults show mode, size and difficulty without a room-code field', () => {
    const createRoom = vi.fn();
    render(<CreateRoomForm createRoom={createRoom} />);
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/Medium board · Medium difficulty · Standard · 3 shared lives/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create room with selected settings' }));
    expect(useMinesweeperStore.getState().room).toBe('fresh-canyon');
    expect(createRoom).toHaveBeenCalledOnce();
});

test('customization updates the summary and survives collapsing the controls', () => {
    render(<CreateRoomForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    fireEvent.click(screen.getByRole('radio', { name: /Standard/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Small/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Hard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done customizing' }));
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
    expect(screen.getByText(/Small board · Hard difficulty · Standard/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect((screen.getByRole('radio', { name: /Standard/ }) as HTMLInputElement).checked).toBe(true);
});

test('retry generates a fresh code and reuses the confirmed identity without another name dialog', () => {
    const retryCreateRoom = vi.fn();
    useMinesweeperStore.setState({ room: 'taken', name: 'Alice', relaxed: true });
    render(<CreateRoomForm retryCreateRoom={retryCreateRoom} />);
    expect(retryCreateRoom).not.toHaveBeenCalled();
    act(() => useMinesweeperStore.getState().requestNewRoomCode());
    expect(retryCreateRoom).toHaveBeenCalledOnce();
    expect(useMinesweeperStore.getState()).toMatchObject({ room: 'fresh-canyon', name: 'Alice', relaxed: true });
});
