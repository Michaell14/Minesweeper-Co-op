import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    DRILL_PROGRESS_KEY,
    readProgress,
    recordSolved,
    sanitizeProgress,
} from './drillProgress';

let store: Map<string, string>;

beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal('window', { localStorage: globalThis.localStorage });
});

describe('sanitizeProgress', () => {
    test('anything that is not an object becomes empty progress', () => {
        const empty = { version: 1, completed: [], perfect: [] };
        expect(sanitizeProgress(null)).toEqual(empty);
        expect(sanitizeProgress('nonsense')).toEqual(empty);
        expect(sanitizeProgress([1, 2, 3])).toEqual(empty);
    });

    test('drops unknown keys and defaults missing ones', () => {
        expect(sanitizeProgress({ completed: ['counting-a'], nonsense: true })).toEqual({
            version: 1,
            completed: ['counting-a'],
            perfect: [],
        });
    });

    test('keeps only string ids, and only once each', () => {
        expect(sanitizeProgress({ completed: ['a', 7, null, 'a', 'b'] }).completed).toEqual(['a', 'b']);
    });

    test('forces the version, whatever the blob claims', () => {
        expect(sanitizeProgress({ version: 99 }).version).toBe(1);
    });
});

describe('reading', () => {
    test('a browser with nothing stored has no progress', () => {
        expect(readProgress()).toEqual({ version: 1, completed: [], perfect: [] });
    });

    test('a corrupt blob degrades to no progress rather than throwing', () => {
        store.set(DRILL_PROGRESS_KEY, '{not json');
        expect(readProgress()).toEqual({ version: 1, completed: [], perfect: [] });
    });
});

describe('recording a solve', () => {
    test('a clean solve counts as completed and perfect', () => {
        recordSolved('counting-a', 0);
        expect(readProgress()).toEqual({
            version: 1,
            completed: ['counting-a'],
            perfect: ['counting-a'],
        });
    });

    test('a solve with mistakes counts as completed only', () => {
        recordSolved('counting-a', 2);
        expect(readProgress()).toEqual({ version: 1, completed: ['counting-a'], perfect: [] });
    });

    test('a later scrappy solve does not take back an earned perfect', () => {
        recordSolved('counting-a', 0);
        recordSolved('counting-a', 3);
        expect(readProgress().perfect).toEqual(['counting-a']);
    });

    test('solving the same drill twice records it once', () => {
        recordSolved('counting-a', 1);
        recordSolved('counting-a', 1);
        expect(readProgress().completed).toEqual(['counting-a']);
    });
});
