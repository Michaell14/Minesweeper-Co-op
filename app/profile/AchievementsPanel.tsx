'use client'
import React from 'react';
import { Badge, Panel } from '@/components/ds';
import { ACHIEVEMENTS, metricsFrom, progressOf } from '@/shared/achievements';
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
 */

interface AchievementsPanelProps {
    /** Newest first. Absent against a backend that predates the field. */
    achievements: EarnedAchievement[];
    stats: ProfileStats;
    /** Ids to flag as new since this browser last looked; see lib/achievementsSeen. */
    highlighted?: Set<string>;
}

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

    return (
        <section aria-labelledby="profile-achievements" className="mb-8">
            <Panel title={<span id="profile-achievements">Achievements</span>}>
                <p className="text-pixel-sm" role="status" aria-label="Achievements earned">
                    🏆 <strong>{earnedCount}</strong> of {ACHIEVEMENTS.length} earned
                </p>

                <ul
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2 list-none p-0 mt-4 mb-0"
                    /* Explicit despite the tag: WebKit strips list semantics
                       from any list-style:none list. */
                    role="list"
                    aria-label="Achievements">
                    {ACHIEVEMENTS.map((achievement) => {
                        const earned = earnedAt.get(achievement.id);
                        const secret = achievement.hidden && !earned;
                        const progress = earned ? null : progressOf(achievement, metrics);
                        const isNew = !!earned && !!highlighted?.has(achievement.id);

                        /*
                         * Qualified but not yet awarded. Normally impossible —
                         * the award shares a transaction with the aggregate
                         * that triggers it — but lowering a threshold puts
                         * everyone who already qualifies here until their next
                         * game. A full bar on a locked tile reads as a bug, so
                         * say what is actually happening.
                         */
                        const pending = !!progress && progress.value >= progress.threshold;

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
                                    {secret
                                        ? 'Earn it to find out.'
                                        : achievement.description}
                                </p>

                                {earned && (
                                    <p className="text-pixel-2xs text-ink-muted mt-2 mb-0">
                                        Earned {formatDate(earned)}
                                    </p>
                                )}

                                {pending && (
                                    <p className="text-pixel-2xs text-ink-muted mt-2 mb-0" aria-hidden="true">
                                        Lands when you next finish a game.
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
                    })}
                </ul>
            </Panel>
        </section>
    );
}
