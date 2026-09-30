// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS, openDialog } from '@/lib/dialogs';
import CustomBoardDialog from './CustomBoardDialog';
import CreateRoomForm from './CreateRoomForm';

vi.mock('@/lib/dialogs', async () => ({
    ...await vi.importActual<typeof import('@/lib/dialogs')>('@/lib/dialogs'),
    openDialog: (id: string) => {
        const dialog = document.getElementById(id) as HTMLDialogElement;
        dialog.open = true;
        dialog.dispatchEvent(new Event('toggle'));
    },
    closeDialog: (id: string) => {
        const dialog = document.getElementById(id) as HTMLDialogElement;
        dialog.open = false;
        dialog.dispatchEvent(new Event('close'));
    },
}));

beforeEach(() => useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true));

test('opening and canceling a custom draft preserves the selected preset and dimensions', () => {
    useMinesweeperStore.getState().setBoardConfig('Small', 'Hard');
    const before = useMinesweeperStore.getState();
    render(<><CreateRoomForm /><CustomBoardDialog /></>);
    fireEvent.click(screen.getByRole('radio', { name: /Custom/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /Number of rows/ }), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel custom board settings' }));
    expect(useMinesweeperStore.getState()).toMatchObject({
        boardSize: before.boardSize, difficulty: before.difficulty,
        numRows: before.numRows, numCols: before.numCols, numMines: before.numMines,
    });
});

test('Escape discards a draft and reopening refreshes from the current selection', () => {
    render(<CustomBoardDialog />);
    act(() => useMinesweeperStore.getState().setBoardConfig('Custom', 'Easy', { rows: 12, cols: 15 }));
    act(() => openDialog(DIALOGS.custom));
    expect((screen.getByRole('spinbutton', { name: /Number of rows/ }) as HTMLInputElement).value).toBe('12');
    const dialog = document.getElementById(DIALOGS.custom) as HTMLDialogElement;
    fireEvent.change(screen.getByRole('spinbutton', { name: /Number of rows/ }), { target: { value: '20' } });
    fireEvent(dialog, new Event('cancel'));
    dialog.open = false;
    act(() => openDialog(DIALOGS.custom));
    expect((screen.getByRole('spinbutton', { name: /Number of rows/ }) as HTMLInputElement).value).toBe('12');
    expect(useMinesweeperStore.getState()).toMatchObject({ boardSize: 'Custom', numRows: 12, numCols: 15 });
});

test('confirmation applies the draft and its derived mine count', async () => {
    const { container } = render(<CustomBoardDialog />);
    act(() => openDialog(DIALOGS.custom));
    fireEvent.change(screen.getByRole('spinbutton', { name: /Number of rows/ }), { target: { value: '12' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /Number of columns/ }), { target: { value: '15' } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(useMinesweeperStore.getState()).toMatchObject({ boardSize: 'Custom', numRows: 12, numCols: 15, numMines: 28 }));
    expect((document.getElementById(DIALOGS.custom) as HTMLDialogElement).open).toBe(false);
});
