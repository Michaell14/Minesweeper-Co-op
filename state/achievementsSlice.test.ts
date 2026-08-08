/**
 * The unlock queue. Both failure modes drop an announcement silently: a single
 * slot loses everything but the last id, and a missing dedupe shows the same
 * badge twice.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useMinesweeperStore } from './store';

const queue = () => useMinesweeperStore.getState().unlockedQueue;
const push = (ids: string[]) => useMinesweeperStore.getState().pushUnlocked(ids);
const dismiss = (id: string) => useMinesweeperStore.getState().dismissUnlocked(id);

beforeEach(() => useMinesweeperStore.setState({ unlockedQueue: [] }));

describe('the unlock queue', () => {
    it('starts empty', () => {
        expect(queue()).toEqual([]);
    });

    // One clear can be a tenth win AND a first Extreme board.
    it('keeps every id from one announcement', () => {
        push(['sweeper', 'extreme-measures']);
        expect(queue()).toEqual(['sweeper', 'extreme-measures']);
    });

    it('appends a later announcement behind the first', () => {
        push(['sweeper']);
        push(['blink']);
        expect(queue()).toEqual(['sweeper', 'blink']);
    });

    it('never queues the same id twice', () => {
        push(['sweeper']);
        push(['sweeper', 'blink']);
        expect(queue()).toEqual(['sweeper', 'blink']);
    });

    it('drops only the dismissed id', () => {
        push(['sweeper', 'blink']);
        dismiss('sweeper');
        expect(queue()).toEqual(['blink']);
    });

    it('ignores a dismiss for something that is not queued', () => {
        push(['sweeper']);
        dismiss('nonsense');
        expect(queue()).toEqual(['sweeper']);
    });
});
