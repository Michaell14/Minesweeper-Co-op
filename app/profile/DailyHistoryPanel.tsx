'use client'
import React from 'react';
import { Badge, Button, Panel } from '@/components/ds';
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
 * The daily-challenge section: the clear streak and a month calendar. Pure
 * presentation; every day string stays a string (see lib/dailyCalendar.ts).
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

const cellLabel = (day: string, result: DailyDayResult | undefined): string => {
    if (!result) return `${day} — not played`;
    return result.won && result.durationMs != null
        ? `${day} — cleared in ${formatElapsed(result.durationMs)}`
        : result.won
            ? `${day} — cleared`
            : `${day} — attempted, not cleared${result.durationMs != null ? ` (${formatElapsed(result.durationMs)})` : ''}`;
};

export default function DailyHistoryPanel({
    history,
    dailyCurrentStreak,
    dailyBestStreak,
    lastDailyDay,
    today = todayUtc(),
}: DailyHistoryPanelProps) {
    const [cursor, setCursor] = React.useState(() => monthOf(today));
    const [selectedDay, setSelectedDay] = React.useState<string | null>(null);

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
    const changeMonth = (delta: number) => {
        setCursor((current) => addMonths(current, delta));
        setSelectedDay(null);
    };

    return (
        <section aria-labelledby="profile-daily" className="mb-8">
            <Panel title={<span id="profile-daily">Daily Challenge</span>} className="max-sm:!px-4">
                <p className="text-pixel-sm" role="status" aria-label="Daily streak">
                    🧩 Daily streak: <strong>{streak}</strong> day
                    {streak === 1 ? '' : 's'} (best {dailyBestStreak})
                </p>

                <div className="flex items-center justify-between mt-4 mb-2">
                    <Button
                        size="sm"
                        aria-label="Previous month"
                        disabled={prevDisabled}
                        onClick={() => changeMonth(-1)}>
                        &lt;
                    </Button>
                    <span className="text-pixel-sm">{monthLabel(cursor)}</span>
                    <Button
                        size="sm"
                        aria-label="Next month"
                        disabled={nextDisabled}
                        onClick={() => changeMonth(1)}>
                        &gt;
                    </Button>
                </div>

                <div className="grid grid-cols-7 gap-2 mb-1" aria-hidden="true">
                    {WEEKDAY_LETTERS.map((letter, i) => (
                        <span key={i} className="text-pixel-2xs text-ink-muted text-center">
                            {letter}
                        </span>
                    ))}
                </div>

                <ul
                    className="grid grid-cols-7 gap-2 list-none p-0 m-0"
                    // Explicit: WebKit strips list semantics from a list-style:none list, and the name hangs off the role.
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
                            <li key={i} className="flex aspect-square w-full min-w-0 min-h-8" aria-hidden={state === 'future' || undefined}>
                                {state === 'future' ? (
                                    <span className="flex-1 flex items-center justify-center bg-surface-disabled text-ink-muted text-pixel-sm">
                                        {Number(day.slice(-2))}
                                    </span>
                                ) : (
                                    <Button
                                        size="sm"
                                        intent={state === 'cleared' ? 'success' : state === 'failed' ? 'error' : 'default'}
                                        className="flex-1 min-w-0"
                                        // The grid gap already reserves the notched border;
                                        // standard button padding cannot fit seven dates on mobile.
                                        style={{ padding: 0, margin: 0 }}
                                        aria-label={label}
                                        aria-current={day === today ? 'date' : undefined}
                                        aria-pressed={selectedDay === day}
                                        onClick={() => setSelectedDay(day)}>
                                        <span className={selectedDay === day ? 'underline font-bold' : undefined}>
                                            {Number(day.slice(-2))}
                                        </span>
                                    </Button>
                                )}
                            </li>
                        );
                    })}
                </ul>

                <div className="flex flex-wrap gap-2 mt-4" aria-label="Result legend">
                    <Badge intent="success" size="sm">Cleared</Badge>
                    <Badge intent="error" size="sm">Not cleared</Badge>
                    <Badge size="sm">Not played</Badge>
                </div>
                <p className="text-pixel-sm mt-3" role="status" aria-label="Selected daily result" aria-atomic="true">
                    {selectedDay ? cellLabel(selectedDay, byDay.get(selectedDay)) : 'Select a day to see its result. Dates are UTC.'}
                </p>

                {history.length === 0 && (
                    <p className="text-pixel-sm text-ink-muted mt-4">
                        No dailies recorded yet — finish one signed in and it lands here.
                    </p>
                )}
            </Panel>
        </section>
    );
}
