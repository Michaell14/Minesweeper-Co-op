// @vitest-environment jsdom
/**
 * The daily explainer's once-ever flag. Both failure modes are silent: a flag
 * written too early means a first-time player never sees the rules, and one
 * never written means the explainer greets a regular every single visit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasSeenDailyExplainer, markDailyExplainerSeen } from './dailyExplainerSeen';

beforeEach(() => localStorage.clear());
afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('hasSeenDailyExplainer', () => {
    it('is false on a browser that has never played the daily', () => {
        expect(hasSeenDailyExplainer()).toBe(false);
    });

    it('is true once the explainer has been shown', () => {
        markDailyExplainerSeen();
        expect(hasSeenDailyExplainer()).toBe(true);
    });

    /*
     * Private mode throws on both calls. Showing the rules again is the right
     * way to fail; suppressing them forever is not.
     */
    it('reports not-seen when storage cannot be read', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(hasSeenDailyExplainer()).toBe(false);
    });

    it('does not throw when storage cannot be written', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        expect(() => markDailyExplainerSeen()).not.toThrow();
    });

    /* A stray value is not the flag: only the exact write counts as seen. */
    it('ignores a value it did not write', () => {
        localStorage.setItem('minesweeper_daily_explainer_seen', 'yes');
        expect(hasSeenDailyExplainer()).toBe(false);
    });
});
