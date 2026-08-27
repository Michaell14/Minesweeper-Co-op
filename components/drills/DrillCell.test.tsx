// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import DrillCell from './DrillCell';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn() }));
import { playSound } from '@/lib/sound';

const onOpen = vi.fn();
const onFlag = vi.fn();

const renderCell = (props: Partial<React.ComponentProps<typeof DrillCell>> = {}) =>
    render(
        <DrillCell
            state="covered"
            row={0}
            col={0}
            nearby={0}
            onOpen={onOpen}
            onFlag={onFlag}
            {...props}
        />,
    );

const cell = () => screen.getByRole('gridcell');

const setSettings = (over: Record<string, boolean>) =>
    useMinesweeperStore.setState((state) => ({ settings: { ...state.settings, ...over } }));

beforeEach(() => {
    vi.clearAllMocks();
    setSettings({ swapMouseButtons: false, mobileDefaultFlag: false });
});

describe('what a drill cell shows', () => {
    test('is a gridcell named by its state and position', () => {
        renderCell({ row: 1, col: 2 });
        expect(screen.getByRole('gridcell', { name: 'Unrevealed cell at row 2, column 3' })).toBeTruthy();
    });

    test('an opened cell shows its derived count', () => {
        renderCell({ state: 'open', nearby: 3 });
        expect(cell().textContent).toBe('3');
    });

    test('an opened cell touching nothing shows nothing', () => {
        renderCell({ state: 'open', nearby: 0 });
        expect(cell().textContent).toBe('');
    });

    test('a flagged cell draws the shared flag sprite', () => {
        const { container } = renderCell({ state: 'flagged' });
        expect(container.querySelector('use')?.getAttribute('href')).toMatch(/flag/i);
    });
});

describe('mouse input', () => {
    test('left opens and right flags', () => {
        renderCell();
        fireEvent.mouseUp(cell(), { button: 0 });
        expect(onOpen).toHaveBeenCalledWith(0, 0);
        fireEvent.contextMenu(cell());
        expect(onFlag).toHaveBeenCalledWith(0, 0);
    });

    test('swapMouseButtons exchanges what the two buttons mean', () => {
        setSettings({ swapMouseButtons: true });
        renderCell();
        fireEvent.mouseUp(cell(), { button: 0 });
        expect(onFlag).toHaveBeenCalledWith(0, 0);
        fireEvent.contextMenu(cell());
        expect(onOpen).toHaveBeenCalledWith(0, 0);
    });

    test('an already opened cell takes no move', () => {
        renderCell({ state: 'open', nearby: 1 });
        fireEvent.mouseUp(cell(), { button: 0 });
        fireEvent.contextMenu(cell());
        expect(onOpen).not.toHaveBeenCalled();
        expect(onFlag).not.toHaveBeenCalled();
    });
});

describe('keyboard input', () => {
    test('Enter opens and F flags, whatever the mouse swap says', () => {
        setSettings({ swapMouseButtons: true });
        renderCell();
        fireEvent.keyDown(cell(), { key: 'Enter' });
        expect(onOpen).toHaveBeenCalledWith(0, 0);
        fireEvent.keyDown(cell(), { key: 'f' });
        expect(onFlag).toHaveBeenCalledWith(0, 0);
    });

    test('every cell is reachable by tab', () => {
        renderCell();
        expect(cell().tagName).toBe('BUTTON');
        expect(cell().hasAttribute('disabled')).toBe(false);
    });
});

describe('sound', () => {
    test('opening plays the reveal blip', () => {
        renderCell();
        fireEvent.mouseUp(cell(), { button: 0 });
        expect(playSound).toHaveBeenCalledWith('reveal');
    });

    test('flagging plays the flag blip, unflagging the other', () => {
        renderCell();
        fireEvent.contextMenu(cell());
        expect(playSound).toHaveBeenCalledWith('flag');

        vi.clearAllMocks();
        renderCell({ state: 'flagged' });
        fireEvent.contextMenu(screen.getAllByRole('gridcell')[1]);
        expect(playSound).toHaveBeenCalledWith('unflag');
    });
});

describe('touch input', () => {
    // jsdom implements no PointerEvent, so fireEvent's init is dropped and
    // pointerType never arrives. Define it on a real event instead.
    const pointer = (el: HTMLElement, type: 'pointerdown' | 'pointerup') => {
        const event = new Event(type, { bubbles: true });
        Object.defineProperty(event, 'pointerType', { value: 'touch' });
        fireEvent(el, event);
    };
    const tap = (el: HTMLElement) => {
        pointer(el, 'pointerdown');
        pointer(el, 'pointerup');
    };

    test('a tap opens by default', () => {
        renderCell();
        tap(cell());
        expect(onOpen).toHaveBeenCalledWith(0, 0);
        expect(onFlag).not.toHaveBeenCalled();
    });

    test('mobileDefaultFlag makes a tap flag instead', () => {
        setSettings({ mobileDefaultFlag: true });
        renderCell();
        tap(cell());
        expect(onFlag).toHaveBeenCalledWith(0, 0);
        expect(onOpen).not.toHaveBeenCalled();
    });

    test('a long press does the other one', () => {
        vi.useFakeTimers();
        try {
            renderCell();
            pointer(cell(), 'pointerdown');
            vi.advanceTimersByTime(500);
            pointer(cell(), 'pointerup');
            expect(onFlag).toHaveBeenCalledWith(0, 0);
            expect(onOpen).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    test('a tap does not also fire the compatibility mouse event', () => {
        renderCell();
        tap(cell());
        fireEvent.mouseUp(cell(), { button: 0 });
        expect(onOpen).toHaveBeenCalledTimes(1);
    });
});
