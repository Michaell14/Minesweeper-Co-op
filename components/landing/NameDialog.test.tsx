// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS } from '@/lib/dialogs';
import NameDialog from './NameDialog';

const closeDialog = vi.hoisted(() => vi.fn());
vi.mock('@/lib/dialogs', async () => ({
    ...await vi.importActual<typeof import('@/lib/dialogs')>('@/lib/dialogs'),
    closeDialog,
}));

beforeEach(() => {
    useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true);
    closeDialog.mockReset();
});

const renderName = (onConfirm = vi.fn()) => {
    const result = render(<NameDialog id={DIALOGS.nameJoin} confirmLabel="Join room"
        setName={useMinesweeperStore.getState().setName} onConfirm={onConfirm} />);
    result.container.querySelector('dialog')!.open = true;
    return { ...result, onConfirm };
};

test('reuses a guest name from this visit and confirms a trimmed name on form submission', () => {
    useMinesweeperStore.getState().setName('  Alice  ');
    const { container, onConfirm } = renderName();
    expect((screen.getByRole('textbox', { name: 'Your player name' }) as HTMLInputElement).value).toBe('  Alice  ');
    fireEvent.submit(container.querySelector('form')!);
    expect(useMinesweeperStore.getState().name).toBe('Alice');
    expect(closeDialog).toHaveBeenCalledWith(DIALOGS.nameJoin);
    expect(onConfirm).toHaveBeenCalledOnce();
});

test('whitespace stays in the dialog with an accessible inline error and can be corrected', () => {
    const { container, onConfirm } = renderName();
    const input = screen.getByRole('textbox', { name: 'Your player name' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByRole('alert').textContent).toContain('Enter a name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(closeDialog).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Bob' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect(onConfirm).toHaveBeenCalledOnce();
});
