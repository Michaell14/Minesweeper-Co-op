import React from 'react';
import styles from '@/components/game/board.module.css';
import drills from './drills.module.css';
import { pointerClass } from '@/components/ds/pointer';
import Sprite from '@/components/ds/sprites';
import { useMinesweeperStore } from '@/app/store';
import { playSound } from '@/lib/sound';
import { drillCellLabel, type DrillCellState } from './drillLabel';

const LONG_PRESS_MS = 400;

export interface DrillCellProps {
    state: DrillCellState;
    row: number;
    col: number;
    /** Derived from the layout by `adjacentMines`; only meaningful when open. */
    nearby: number;
    onOpen: (row: number, col: number) => void;
    onFlag: (row: number, col: number) => void;
}

export default function DrillCell({ state, row, col, nearby, onOpen, onFlag }: DrillCellProps) {
    // getState, never a subscription: drills own their board, the store only
    // holds the input preferences the muscle memory has to match.
    const settings = () => useMinesweeperStore.getState().settings;

    const fromTouch = React.useRef(false);
    const longPress = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressFired = React.useRef(false);

    const isOpen = state === 'open';

    const open = () => {
        if (isOpen) return;
        playSound('reveal');
        onOpen(row, col);
    };
    const flag = () => {
        if (isOpen) return;
        playSound(state === 'flagged' ? 'unflag' : 'flag');
        onFlag(row, col);
    };

    const primary = () => (settings().swapMouseButtons ? flag() : open());
    const secondary = () => (settings().swapMouseButtons ? open() : flag());

    const tap = () => (settings().mobileDefaultFlag ? flag() : open());
    const holdTap = () => (settings().mobileDefaultFlag ? open() : flag());

    const clearHold = () => {
        if (longPress.current) clearTimeout(longPress.current);
        longPress.current = null;
    };

    const handlePointerDown = (event: React.PointerEvent) => {
        fromTouch.current = event.pointerType === 'touch';
        if (!fromTouch.current) return;
        longPressFired.current = false;
        longPress.current = setTimeout(() => {
            longPressFired.current = true;
            holdTap();
        }, LONG_PRESS_MS);
    };

    const handlePointerUp = (event: React.PointerEvent) => {
        if (event.pointerType !== 'touch') return;
        clearHold();
        if (!longPressFired.current) tap();
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        // Enter opens and F flags whatever the MOUSE swap says — that setting
        // is about which button, and a keyboard has neither.
        if (event.key === 'Enter') {
            event.preventDefault();
            open();
        } else if (event.key.toLowerCase() === 'f') {
            event.preventDefault();
            flag();
        }
    };

    const className = [
        styles.cell,
        isOpen ? styles.open : styles.closed,
        isOpen && nearby > 0 ? styles[`num${nearby}`] : '',
        state === 'wrong' ? drills.wrong : '',
        isOpen ? '' : pointerClass,
    ].filter(Boolean).join(' ');

    return (
        <button
            type="button"
            role="gridcell"
            aria-label={drillCellLabel(state, row, col, nearby)}
            className={className}
            onMouseUp={(event) => {
                // A tap raises a compatibility mouseup too; the touch path
                // has already acted on it.
                if (event.button === 0 && !fromTouch.current) primary();
            }}
            onContextMenu={(event) => {
                event.preventDefault();
                if (!fromTouch.current) secondary();
            }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={clearHold}
            onPointerLeave={clearHold}
            onKeyDown={handleKeyDown}
        >
            {state === 'flagged' ? <Sprite kind="flag" className={styles.cellSprite} /> : null}
            {isOpen && nearby > 0 ? nearby : ''}
        </button>
    );
}
