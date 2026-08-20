'use client'
import React from 'react';
import { Badge, Panel, pointerClass } from '@/components/ds';
import { ACHIEVEMENTS, isPending, metricsFrom, PENDING_NOTE, progressOf } from '@/shared/achievements';
import { formatDate } from '@/lib/formatDate';
import type { EarnedAchievement, ProfileStats } from '@/lib/statsApi';

/**
 * The achievement shelf. Pure presentation over the profile payload — the page
 * fetches, this draws.
 *
 * Locked entries are rendered too, with their progress, which is the whole
 * reason the catalog is shared rather than server-side: a shelf that only
 * shows what you already have gives nobody a reason to play. Progress comes
 * from the same `metricsFrom` the server awards on, so the bar and the badge
 * can never disagree about what counts.
 *
 * A HIDDEN entry shows neither name nor description until it is earned. It
 * still occupies a tile, so the shelf's size is honest about what is left.
 *
 * The first few tiles are always on show and the rest sit behind a native
 * `<details>` — the whole catalog was ~1500px of page and buried the panels
 * below it, but hiding all of it left a profile with nothing to look at.
 * `<details>` rather than a button and conditional render: keyboard operation,
 * the disclosure role and the expanded state come with the element, and none
 * of them can drift out of step with each other later.
 */

/** How many tiles stay visible when collapsed: two rows of the desktop grid. */
const PREVIEW_COUNT = 4;

interface AchievementsPanelProps {
    /** Newest first. Absent against a backend that predates the field. */
    achievements: EarnedAchievement[];
    stats: ProfileStats;
    /** Ids to flag as new since this browser last looked; see lib/achievementsSeen. */
    highlighted?: Set<string>;
}

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-2 list-none p-0 mb-0';

export default function AchievementsPanel({
    achievements,
    stats,
    highlighted,
}: AchievementsPanelProps) {
    const earnedAt = React.useMemo(
        () => new Map(achievements.map((a) => [a.id, a.earnedAt])),
        [achievements],
    );
    const metrics = React.useMemo(() => metricsFrom(stats), [stats]);

    const earnedCount = ACHIEVEMENTS.filter((a) => earnedAt.has(a.id)).length;
    const preview = ACHIEVEMENTS.slice(0, PREVIEW_COUNT);
    const rest = ACHIEVEMENTS.slice(PREVIEW_COUNT);

    /*
     * Opens itself when there is something new BEHIND THE FOLD — otherwise the
     * "New" badges announce an unlock to a panel the player has to think to
     * open, which is the one case collapsing must not cost anything.
     *
     * Scoped to `rest`, not to the whole shelf: a badge on a preview tile is
     * already on screen, so expanding for it would show twenty-two tiles
     * nobody asked for and push the panels below down the page.
     */
    const hasHiddenNews = !!highlighted && rest.some(({ id }) => highlighted.has(id));

    const tile = (achievement: (typeof ACHIEVEMENTS)[number]) => {
        const earned = earnedAt.get(achievement.id);
        const secret = achievement.hidden && !earned;
        const progress = earned ? null : progressOf(achievement, metrics);
        const isNew = !!earned && !!highlighted?.has(achievement.id);

        // Shared with the avatar picker's locks — see `isPending`. The earned
        // guard stays here: `isPending` reads the metrics, which keep meeting
        // the threshold long after the badge lands.
        const pending = !earned && isPending(achievement, metrics);

        const name = secret ? 'Hidden achievement' : achievement.name;
        const label = earned
            ? `${name} — earned ${formatDate(earned)}`
            : pending
                ? `${name} — earned on your next game`
                : progress
                    ? `${name} — locked, ${progress.value} of ${progress.threshold}`
                    : `${name} — locked`;

        return (
            <li
                key={achievement.id}
                aria-label={label}
                className={`border-pixel p-3 ${earned ? 'border-edge' : 'border-edge-muted'}`}>
                <div className="flex items-baseline justify-between gap-2">
                    <span className={`text-pixel-sm ${earned ? '' : 'text-ink-muted'}`}>
                        {secret ? '???' : achievement.name}
                    </span>
                    {isNew && <Badge intent="primary" size="sm">New</Badge>}
                </div>

                <p className="text-pixel-2xs text-ink-muted mt-2 mb-0">
                    {secret ? 'Earn it to find out.' : achievement.description}
                </p>

                {earned && (
                    <p className="text-pixel-2xs text-ink-muted mt-2 mb-0">
                        Earned {formatDate(earned)}
                    </p>
                )}

                {pending && (
                    <p className="text-pixel-2xs text-ink-muted mt-2 mb-0" aria-hidden="true">
                        {PENDING_NOTE}
                    </p>
                )}

                {progress && !pending && (
                    <div className="mt-2">
                        <div className="h-2 bg-surface-track" aria-hidden="true">
                            <div
                                className="h-full bg-progress-own"
                                style={{ width: `${(progress.value / progress.threshold) * 100}%` }}
                            />
                        </div>
                        <p className="text-pixel-2xs text-ink-muted mt-1 mb-0" aria-hidden="true">
                            {progress.value} / {progress.threshold}
                        </p>
                    </div>
                )}
            </li>
        );
    };

    return (
        <section aria-labelledby="profile-achievements" className="mb-8">
            <Panel title={<span id="profile-achievements">Achievements</span>}>
                <p className="text-pixel-sm" role="status" aria-label="Achievements earned">
                    🏆 <strong>{earnedCount}</strong> of {ACHIEVEMENTS.length} earned
                </p>

                <ul
                    className={`${GRID} mt-4`}
                    /* Explicit despite the tag: WebKit strips list semantics
                       from any list-style:none list. */
                    role="list"
                    aria-label="Achievements">
                    {preview.map(tile)}
                </ul>

                {rest.length > 0 && (
                    <details className="group mt-2" open={hasHiddenNews}>
                        <summary
                            /*
                             * `list-none` kills the marker in Chrome and
                             * Firefox; Safari needs the -webkit pseudo-element
                             * too. `py-2` is the tap target, not decoration:
                             * one line of text-pixel-sm is 16px tall, well
                             * under the 24px minimum, and this is the only
                             * control on the panel.
                             *
                             * The row layout hangs off an inner span so this
                             * stays `display: list-item` — a summary given
                             * `display: flex` loses its disclosure triangle in
                             * Safari, and the marker is the affordance the
                             * chevron replaces.
                             */
                            className={`text-pixel-sm py-2 list-none [&::-webkit-details-marker]:hidden ${pointerClass}`}>
                            <span className="flex items-center gap-2">
                                <span aria-hidden="true" className="group-open:hidden">▸</span>
                                <span aria-hidden="true" className="hidden group-open:inline">▾</span>
                                <span className="group-open:hidden">Show all {ACHIEVEMENTS.length}</span>
                                <span className="hidden group-open:inline">Show fewer</span>
                            </span>
                        </summary>

                        <ul className={`${GRID} mt-2`} role="list" aria-label="More achievements">
                            {rest.map(tile)}
                        </ul>
                    </details>
                )}
            </Panel>
        </section>
    );
}
