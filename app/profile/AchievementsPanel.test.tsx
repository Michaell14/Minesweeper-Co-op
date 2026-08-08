// @vitest-environment jsdom
/**
 * The shelf's silent failure modes: a locked entry that stops saying it is
 * locked, a hidden entry that leaks its name before it is earned, and progress
 * derived from something other than what the server awards on.
 */
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
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

/*
 * NOTE for everything below: jsdom does not hide the contents of a CLOSED
 * <details>, so these queries find tiles a real browser would not paint. That
 * makes the assertions here about content and naming only — whether collapsing
 * actually hides anything is a browser question, not a jsdom one.
 */
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

describe('collapsing', () => {
    const details = (c: HTMLElement) => c.querySelector('details') as HTMLDetailsElement;
    /** Tiles OUTSIDE the disclosure — the ones on show while collapsed. */
    const previewTiles = (c: HTMLElement) =>
        [...c.querySelectorAll('li')].filter((li) => !li.closest('details'));

    it('starts collapsed, so the shelf does not bury the panels below it', () => {
        const { container } = renderPanel();
        expect(details(container).open).toBe(false);
    });

    /*
     * The point of the preview: hiding the whole catalog left a profile with
     * nothing to look at, so a few tiles sit outside the disclosure entirely.
     */
    it('keeps the first few tiles on show while collapsed', () => {
        const { container } = renderPanel();
        const shown = previewTiles(container);

        expect(shown).toHaveLength(4);
        expect(shown[0].getAttribute('aria-label')).toContain(ACHIEVEMENTS[0].name);
        expect(container.querySelectorAll('li')).toHaveLength(ACHIEVEMENTS.length);
    });

    it('offers the rest by count, and says so when open', () => {
        const { container } = renderPanel();
        const summary = container.querySelector('summary')!;
        expect(summary.textContent).toContain(`Show all ${ACHIEVEMENTS.length}`);
        expect(summary.textContent).toContain('Show fewer');
    });

    it('opens and closes from the summary', () => {
        const { container } = renderPanel();
        const summary = container.querySelector('summary')!;

        fireEvent.click(summary);
        expect(details(container).open).toBe(true);

        fireEvent.click(summary);
        expect(details(container).open).toBe(false);
    });

    /*
     * The one case collapsing must not cost anything: the "New" badges are the
     * whole payoff of earning something, and they are useless behind a panel
     * the player has to think to open.
     */
    it('starts open when something is new since the last visit', () => {
        const { container } = renderPanel({
            achievements: [{ id: 'sweeper', earnedAt: '2026-08-08T09:00:00.000Z' }],
            highlighted: new Set(['sweeper']),
        });
        expect(details(container).open).toBe(true);
    });

    it('stays collapsed when the only earned entries are already seen', () => {
        const { container } = renderPanel({
            achievements: [{ id: 'sweeper', earnedAt: '2026-08-08T09:00:00.000Z' }],
            highlighted: new Set(),
        });
        expect(details(container).open).toBe(false);
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
