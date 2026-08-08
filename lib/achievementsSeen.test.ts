// @vitest-environment jsdom
/**
 * The "new since you last looked" watermark. Both failure modes are silent:
 * a watermark set too high suppresses every badge from then on, and never
 * writing one at all means a player's first achievement announces nothing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markAchievementsSeen, newlyEarned } from './achievementsSeen';

const earned = (id: string, earnedAt: string) => ({ id, earnedAt });

const SHELF = [
    earned('sweeper', '2026-08-08T12:00:00.000Z'),
    earned('team-player', '2026-08-05T09:00:00.000Z'),
    earned('first-clear', '2026-08-01T09:00:00.000Z'),
];

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('newlyEarned', () => {
    it('flags nothing on a browser that has never looked', () => {
        expect(newlyEarned(SHELF).size).toBe(0);
    });

    it('flags only what arrived after the watermark', () => {
        markAchievementsSeen([SHELF[1], SHELF[2]]); // looked before `sweeper` landed
        expect([...newlyEarned(SHELF)]).toEqual(['sweeper']);
    });

    it('flags nothing once the shelf has been seen', () => {
        markAchievementsSeen(SHELF);
        expect(newlyEarned(SHELF).size).toBe(0);
    });

    /*
     * The gap worth having a test for: looking at an EMPTY shelf has to be
     * distinguishable from never looking, or a new player's very first
     * achievement is silently already-seen.
     */
    it('flags the first achievement after an empty shelf was seen', () => {
        markAchievementsSeen([]);
        expect([...newlyEarned([SHELF[2]])]).toEqual(['first-clear']);
    });
});

describe('markAchievementsSeen', () => {
    it('records the newest row even if the list arrives out of order', () => {
        markAchievementsSeen([SHELF[2], SHELF[0], SHELF[1]]);
        expect(newlyEarned(SHELF).size).toBe(0);
    });

    it('survives storage being unavailable', () => {
        const getItem = Storage.prototype.getItem;
        const setItem = Storage.prototype.setItem;
        Storage.prototype.getItem = () => { throw new Error('denied'); };
        Storage.prototype.setItem = () => { throw new Error('denied'); };
        try {
            expect(() => markAchievementsSeen(SHELF)).not.toThrow();
            expect(newlyEarned(SHELF).size).toBe(0);
        } finally {
            Storage.prototype.getItem = getItem;
            Storage.prototype.setItem = setItem;
        }
    });
});
