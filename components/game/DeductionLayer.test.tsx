// @vitest-environment jsdom
/** jsdom has no layout engine, so this asserts what is mounted and how many, never where. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import type { LossDiagnosis } from '@/lib/lossDiagnosis';
import DeductionLayer from './DeductionLayer';
import styles from './board.module.css';

const sample: LossDiagnosis = {
    kind: 'provable-mine',
    lesson: 'one-two-one',
    text: 'because.',
    clues: [[1, 1], [1, 3]],
    target: [1, 2],
    verdict: 'mine',
};

const renderLayer = () => {
    const ref = React.createRef<HTMLDivElement>();
    return render(<div ref={ref}><DeductionLayer boardRef={ref} /></div>);
};

beforeEach(() => {
    // useCellMetrics measures with a ResizeObserver jsdom does not ship.
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        unobserve() {}
        disconnect() {}
    });
});

afterEach(() => {
    cleanup();
    useMinesweeperStore.getState().resetDailyState();
});

describe('the deduction overlay', () => {
    test('draws nothing at all when no run has been diagnosed', () => {
        const { container } = renderLayer();

        expect(container.querySelector('[data-deduction]')).toBeNull();
    });

    test('marks every clue cell and the target', () => {
        useMinesweeperStore.getState().setDailyDiagnosis(sample);

        const { container } = renderLayer();

        expect(container.querySelectorAll('[data-deduction="clue"]').length).toBe(2);
        expect(container.querySelectorAll('[data-deduction="target"]').length).toBe(1);
    });

    /* Decorative: the dialog says the same in text; a screen reader need not walk three empty boxes. */
    test('is hidden from assistive tech', () => {
        useMinesweeperStore.getState().setDailyDiagnosis(sample);

        const { container } = renderLayer();

        expect(container.querySelector('[data-deduction-layer]')?.getAttribute('aria-hidden'))
            .toBe('true');
    });

    /* A 'safe' verdict is the opposite claim to 'mine' and must not share the
       danger color, or the safest square reads as the riskiest. */
    test('paints a mine verdict with the error color', () => {
        useMinesweeperStore.getState().setDailyDiagnosis({ ...sample, verdict: 'mine' });

        const { container } = renderLayer();

        const target = container.querySelector('[data-deduction="target"]');
        expect(target?.classList.contains(styles.deductionTargetMine)).toBe(true);
        expect(target?.classList.contains(styles.deductionTargetSafe)).toBe(false);
    });

    test('paints a safe verdict with the success color', () => {
        useMinesweeperStore.getState().setDailyDiagnosis({ ...sample, verdict: 'safe' });

        const { container } = renderLayer();

        const target = container.querySelector('[data-deduction="target"]');
        expect(target?.classList.contains(styles.deductionTargetSafe)).toBe(true);
        expect(target?.classList.contains(styles.deductionTargetMine)).toBe(false);
    });
});
