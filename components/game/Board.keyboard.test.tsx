// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { useKeyboardControls } from '@/hooks/useKeyboardControls';
import Board, { type BoardProps } from './Board';

const state = () => useMinesweeperStore.getState();
const actions = () => ({
    openCell: vi.fn(), toggleFlag: vi.fn(), chordCell: vi.fn(),
    emitCellHover: vi.fn(), pingCell: vi.fn(), handleBoardLeave: vi.fn(),
});

function PlayableBoard(props: BoardProps) {
    useKeyboardControls(props);
    return <Board {...props} />;
}

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
    });
    useMinesweeperStore.setState({ settings: { ...DEFAULT_SETTINGS } });
    act(() => {
        state().setBoard(Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({
            isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0,
        }))));
        state().setMode('co-op');
        state().setKbCursor(null);
        state().setPingArmed(false);
        state().setGameOver(false);
    });
});

test('the board offers one tab stop with keyboard guidance and an announced centre selection', () => {
    render(<PlayableBoard {...actions()} />);
    const grid = screen.getByRole('grid');

    expect(grid.tabIndex).toBe(0);
    const help = document.getElementById(grid.getAttribute('aria-describedby')!);
    expect(help?.textContent).toContain('Arrow keys');
    expect(help?.textContent).toContain('Space or Enter reveals');
    expect(help?.textContent).toContain('Tab moves to the next control');
    act(() => { grid.focus(); });

    expect(state().kbCursor).toEqual({ r: 1, c: 1 });
    expect(document.querySelector('[data-kb-announcer]')?.textContent).toContain('row 2, column 2');
});

test.each([' ', 'Enter'])('%s reveals from grid focus without needing to blur the board', (key) => {
    const props = actions();
    render(<PlayableBoard {...props} />);
    const grid = screen.getByRole('grid');
    act(() => { grid.focus(); });

    fireEvent.keyDown(grid, { key });

    expect(props.openCell).toHaveBeenCalledWith(1, 1);
    expect(document.activeElement).toBe(grid);
});

test('arrows keep grid focus while moving, and F and P act on the moved selection', () => {
    const props = actions();
    render(<PlayableBoard {...props} />);
    const grid = screen.getByRole('grid');
    act(() => { grid.focus(); });

    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'f' });
    fireEvent.keyDown(grid, { key: 'p' });

    expect(document.activeElement).toBe(grid);
    expect(state().kbCursor).toEqual({ r: 1, c: 2 });
    expect(props.toggleFlag).toHaveBeenCalledWith(1, 2);
    expect(props.pingCell).toHaveBeenCalledWith(1, 2);
});

test('focusing the board with a pointer does not summon the keyboard cursor', () => {
    render(<PlayableBoard {...actions()} />);
    const grid = screen.getByRole('grid');
    fireEvent.pointerDown(grid);
    fireEvent.mouseDown(grid);
    act(() => { grid.focus(); });

    expect(state().kbCursor).toBeNull();
});

test('a pointer gesture that did not focus the grid cannot suppress the next keyboard entry', () => {
    render(<PlayableBoard {...actions()} />);
    const grid = screen.getByRole('grid');
    fireEvent.pointerDown(grid);
    fireEvent.mouseDown(grid);
    fireEvent.pointerUp(grid);
    fireEvent.mouseUp(grid);

    act(() => { grid.focus(); });

    expect(state().kbCursor).toEqual({ r: 1, c: 1 });
});

test('keyboard entry is absent when keyboard controls are disabled', () => {
    useMinesweeperStore.setState((s) => ({ settings: { ...s.settings, keyboardControls: false } }));
    render(<PlayableBoard {...actions()} />);
    const grid = screen.getByRole('grid');

    expect(grid.hasAttribute('tabindex')).toBe(false);
    expect(grid.hasAttribute('aria-describedby')).toBe(false);
    expect(state().kbCursor).toBeNull();
});

test('the keyboard instructions do not advertise pings in PvP', () => {
    act(() => { state().setMode('pvp'); });
    render(<PlayableBoard {...actions()} />);
    const grid = screen.getByRole('grid');

    expect(document.getElementById(grid.getAttribute('aria-describedby')!)?.textContent).not.toContain('P pings');
});
