'use client'
import React from 'react';
import { Button, Panel } from '@/components/ds';
import { formatElapsed } from '@/lib/gameClock';
import type { DailyDayResult } from '@/lib/statsApi';
import {
    addMonths,
    buildMonthGrid,
    compareMonths,
    effectiveDailyStreak,
    monthLabel,
    monthOf,
    todayUtc,
} from '@/lib/dailyCalendar';

/**
 * The daily-challenge section: the clear streak and a month calendar of past
 * dailies. Pure presentation over the profile payload — no fetching here, and
 * every day string stays a string (see lib/dailyCalendar.ts for why a day is
 * never parsed through a local-time Date).
 */

interface DailyHistoryPanelProps {
    /** Ascending by day — the server's ORDER BY is the contract. */
    history: DailyDayResult[];
    dailyCurrentStreak: number;
    dailyBestStreak: number;
    lastDailyDay: string | null;
    /** Injectable for deterministic tests; defaults to the real UTC today. */
    today?: string;
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type DayState = 'cleared' | 'failed' | 'unplayed' | 'future';

/** State → token class, ProgressBar's opponentBarColor pattern. */
const cellColor = (state: DayState): string => {
    switch (state) {
        case 'cleared': return 'bg-progress-won';
        case 'failed': return 'bg-progress-failed';
        case 'unplayed': return 'bg-surface-track';
        case 'future': return 'bg-surface-disabled';
    }
};

const cellLabel = (day: string, result: DailyDayResult | undefined): string => {
    if (!result) return `${day} — not played`;
    return result.won && result.durationMs != null
        ? `${day} — cleared in ${formatElapsed(result.durationMs)}`
        : result.won
            ? `${day} — cleared`
            : `${day} — attempted, not cleared`;
};

export default function DailyHistoryPanel({
    history,
    dailyCurrentStreak,
    dailyBestStreak,
    lastDailyDay,
    today = todayUtc(),
}: DailyHistoryPanelProps) {
    const [cursor, setCursor] = React.useState(() => monthOf(today));

    const byDay = React.useMemo(
        () => new Map(history.map((r) => [r.day, r])),
        [history],
    );

    const thisMonth = monthOf(today);
    // No point paging back past recorded history — or forward past today.
    const earliestMonth = history.length > 0 ? monthOf(history[0].day) : thisMonth;
    const prevDisabled = compareMonths(cursor, earliestMonth) <= 0;
    const nextDisabled = compareMonths(cursor, thisMonth) >= 0;

    const streak = effectiveDailyStreak(dailyCurrentStreak, lastDailyDay, today);

    return (
        <section aria-labelledby="profile-daily" className="mb-8">
            <Panel title={<span id="profile-daily">Daily Challenge</span>}>
                <p className="text-pixel-sm" role="status" aria-label="Daily streak">
                    🧩 Daily streak: <strong>{streak}</strong> day
                    {streak === 1 ? '' : 's'} (best {dailyBestStreak})
                </p>

                <div className="flex items-center justify-between mt-4 mb-2">
                    <Button
                        size="sm"
                        aria-label="Previous month"
                        disabled={prevDisabled}
                        onClick={() => setCursor((c) => addMonths(c, -1))}>
                        &lt;
                    </Button>
                    <span className="text-pixel-sm">{monthLabel(cursor)}</span>
                    <Button
                        size="sm"
                        aria-label="Next month"
                        disabled={nextDisabled}
                        onClick={() => setCursor((c) => addMonths(c, 1))}>
                        &gt;
                    </Button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
                    {WEEKDAY_LETTERS.map((letter, i) => (
                        <span key={i} className="text-pixel-2xs text-ink-muted text-center">
                            {letter}
                        </span>
                    ))}
                </div>

                <ul
                    className="grid grid-cols-7 gap-1 list-none p-0 m-0"
                    // Explicit despite the tag: WebKit strips list semantics
                    // from any list-style:none list, and the accessible name
                    // below hangs off the list role existing.
                    role="list"
                    aria-label={`Daily results for ${monthLabel(cursor)}`}>
                    {buildMonthGrid(cursor).map((day, i) => {
                        if (day === null) return <li key={i} aria-hidden="true" />;
                        const result = byDay.get(day);
                        const state: DayState =
                            day > today ? 'future'
                                : result ? (result.won ? 'cleared' : 'failed')
                                    : 'unplayed';
                        const label = cellLabel(day, result);
                        return (
                            <li
                                key={i}
                                className={`aspect-square ${cellColor(state)}${day === today ? ' border-pixel border-edge' : ''}`}
                                {...(state === 'future'
                                    ? { 'aria-hidden': true }
                                    : { 'aria-label': label, title: label })}
                            />
                        );
                    })}
                </ul>

                {history.length === 0 && (
                    <p className="text-pixel-sm text-ink-muted mt-4">
                        No dailies recorded yet — finish one signed in and it lands here.
                    </p>
                )}
            </Panel>
        </section>
    );
}
