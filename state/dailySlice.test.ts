import { afterEach, describe, expect, test } from 'vitest';
import { useMinesweeperStore } from '@/app/store';
import type { LossDiagnosis } from '@/lib/lossDiagnosis';

const sample: LossDiagnosis = {
    kind: 'guess',
    lesson: 'one-two-one',
    text: 'because.',
    clues: [[0, 0], [0, 1]],
    target: [0, 2],
    verdict: 'safe',
};

afterEach(() => useMinesweeperStore.getState().resetDailyState());

describe('the loss diagnosis on the store', () => {
    test('starts empty', () => {
        expect(useMinesweeperStore.getState().dailyDiagnosis).toBeNull();
    });

    test('holds what the handler computed', () => {
        useMinesweeperStore.getState().setDailyDiagnosis(sample);

        expect(useMinesweeperStore.getState().dailyDiagnosis).toEqual(sample);
    });

    /* Leaving the daily must not leave last run's lesson on the next board. */
    test('is cleared when the daily view resets', () => {
        useMinesweeperStore.getState().setDailyDiagnosis(sample);

        useMinesweeperStore.getState().resetDailyState();

        expect(useMinesweeperStore.getState().dailyDiagnosis).toBeNull();
    });
});
