// @vitest-environment jsdom
/**
 * The shelf's silent failure modes: a locked entry that stops saying it is
 * locked, a hidden entry that leaks its name before it is earned, and progress
 * derived from something other than what the server awards on.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import AchievementsPanel from './AchievementsPanel';
import { ACHIEVEMENTS } from '@/shared/achievements';
import type { ProfileStats } from '@/lib/statsApi';

afterEach(cleanup);

const NOBODY: ProfileStats = {
    coopGames: 0, coopWins: 0,
    pvpGames: 0, pvpWins: 0,
    dailyGames: 0, dailyWins: 0,
    currentStreak: 0, bestStreak: 0, lastPlayedDay: null,
    dailyCurrentStreak: 0, dailyBestStreak: 0, lastDailyDay: null,
};

const renderPanel = (props: Partial<React.ComponentProps<typeof AchievementsPanel>> = {}) =>
    render(
        <AchievementsPanel
            achievements={[]}
            stats={NOBODY}
            {...props}
        />,
    );

describe('the shelf', () => {
    it('draws every catalog entry, earned or not', () => {
        renderPanel();
        expect(screen.getAllByRole('listitem')).toHaveLength(ACHIEVEMENTS.length);
    });

    it('counts what has been earned', () => {
        renderPanel({
            achievements: [{ id: 'first-clear', earnedAt: '2026-08-01T09:00:00.000Z' }],
        });
        expect(screen.getByLabelText('Achievements earned').textContent).toContain(
            `1 of ${ACHIEVEMENTS.length}`,
        );
    });

    it('names a locked entry as locked, with its progress', () => {
        renderPanel({ stats: { ...NOBODY, coopWins: 4 } });
        expect(screen.getByRole('listitem', { name: 'Sweeper — locked, 4 of 10' })).toBeTruthy();
    });

    it('names an earned entry with the day it landed', () => {
        renderPanel({
            achievements: [{ id: 'first-clear', earnedAt: '2026-08-01T09:00:00.000Z' }],
            stats: { ...NOBODY, coopWins: 1 },
        });
        const label = new Date('2026-08-01T09:00:00.000Z').toLocaleDateString();
        expect(screen.getByRole('listitem', { name: `First Clear — earned ${label}` })).toBeTruthy();
    });

    it('a moment is locked with no progress to report', () => {
        renderPanel();
        expect(screen.getByRole('listitem', { name: 'Blink and Miss It — locked' })).toBeTruthy();
    });

    // Progress must read the same metrics the server awards on, derived
    // totals included — not just the raw per-mode columns.
    it('derives cross-mode progress the way the evaluator does', () => {
        renderPanel({ stats: { ...NOBODY, coopWins: 3, pvpWins: 2, dailyWins: 1 } });
        expect(screen.getByRole('listitem', { name: 'Sweeper — locked, 6 of 10' })).toBeTruthy();
    });

    /*
     * Qualified but not awarded — what lowering a threshold leaves behind
     * until the player's next game. A full bar on a locked tile reads as a
     * bug, so the tile says what is actually going on instead.
     */
    it('says a qualified-but-unawarded entry lands next game, with no full bar', () => {
        renderPanel({ stats: { ...NOBODY, coopWins: 99 } });
        expect(screen.getByRole('listitem', { name: 'Sweeper — earned on your next game' })).toBeTruthy();
        expect(screen.queryByText('10 / 10')).toBeNull();
    });
});

describe('hidden entries', () => {
    const hidden = ACHIEVEMENTS.find((a) => a.hidden)!;

    it('leak neither name nor description before they are earned', () => {
        renderPanel();
        expect(screen.queryByText(hidden.name)).toBeNull();
        expect(screen.queryByText(hidden.description)).toBeNull();
        expect(screen.getByRole('listitem', { name: 'Hidden achievement — locked' })).toBeTruthy();
    });

    it('reveal themselves once earned', () => {
        renderPanel({ achievements: [{ id: hidden.id, earnedAt: '2026-08-01T09:00:00.000Z' }] });
        expect(screen.getByText(hidden.name)).toBeTruthy();
        expect(screen.getByText(hidden.description)).toBeTruthy();
    });
});

describe('the new badge', () => {
    it('marks only the highlighted ids', () => {
        renderPanel({
            achievements: [
                { id: 'first-clear', earnedAt: '2026-08-01T09:00:00.000Z' },
                { id: 'sweeper', earnedAt: '2026-08-08T09:00:00.000Z' },
            ],
            highlighted: new Set(['sweeper']),
        });
        expect(screen.getAllByText('New')).toHaveLength(1);
    });

    it('shows nothing when nothing is new', () => {
        renderPanel({
            achievements: [{ id: 'first-clear', earnedAt: '2026-08-01T09:00:00.000Z' }],
            highlighted: new Set(),
        });
        expect(screen.queryByText('New')).toBeNull();
    });

    // A badge on a LOCKED tile would be nonsense, and a stale id can produce
    // one: the highlight set outlives whatever the payload now says.
    it('never marks an entry that is not earned', () => {
        renderPanel({ achievements: [], highlighted: new Set(['sweeper']) });
        expect(screen.queryByText('New')).toBeNull();
    });
});
