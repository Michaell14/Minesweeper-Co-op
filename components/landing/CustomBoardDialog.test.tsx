// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS, openDialog } from '@/lib/dialogs';
import { mineCountFor } from '@/shared/boardConfig';
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

test('the mine count follows the draft as it is typed', () => {
    render(<CustomBoardDialog />);
    act(() => openDialog(DIALOGS.custom));
    const difficulty = useMinesweeperStore.getState().difficulty;
    fireEvent.change(screen.getByRole('spinbutton', { name: /Number of rows/ }), { target: { value: '12' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /Number of columns/ }), { target: { value: '15' } });
    expect(screen.getByText(`${difficulty}: ${mineCountFor(12, 15, difficulty)} mines`)).toBeTruthy();
    fireEvent.change(screen.getByRole('spinbutton', { name: /Number of columns/ }), { target: { value: '' } });
    expect(screen.getByText(`${difficulty}: enter dimensions above`)).toBeTruthy();
});

test('an empty dimension keeps the dialog open with its message until it is filled', async () => {
    const before = useMinesweeperStore.getState();
    const { container } = render(<CustomBoardDialog />);
    act(() => openDialog(DIALOGS.custom));
    const rows = screen.getByRole('spinbutton', { name: /Number of rows/ });
    fireEvent.change(rows, { target: { value: '' } });
    expect(screen.queryByRole('alert')).toBeNull();

    // A native method="dialog" submit would close it; validation must get there first.
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    act(() => { container.querySelector('form')!.dispatchEvent(submit); });
    expect(submit.defaultPrevented).toBe(true);
    expect((await screen.findByRole('alert')).textContent).toBe('Number of Rows is Required.');
    await waitFor(() => expect(document.activeElement).toBe(rows));
    expect((document.getElementById(DIALOGS.custom) as HTMLDialogElement).open).toBe(true);
    expect(useMinesweeperStore.getState()).toMatchObject({ numRows: before.numRows, numCols: before.numCols });

    fireEvent.change(rows, { target: { value: '10' } });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

test('reopening clears a previous attempt\'s messages', async () => {
    const { container } = render(<CustomBoardDialog />);
    act(() => openDialog(DIALOGS.custom));
    fireEvent.change(screen.getByRole('spinbutton', { name: /Number of columns/ }), { target: { value: '' } });
    fireEvent.submit(container.querySelector('form')!);
    expect((await screen.findByRole('alert')).textContent).toBe('Number of Columns is Required.');

    (document.getElementById(DIALOGS.custom) as HTMLDialogElement).open = false;
    act(() => openDialog(DIALOGS.custom));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect((screen.getByRole('spinbutton', { name: /Number of columns/ }) as HTMLInputElement).value)
        .toBe(String(useMinesweeperStore.getState().numCols));
});
