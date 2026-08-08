/**
 * The calendar's day maths — pure logic that would be wrong silently: an
 * off-by-one first weekday shifts every cell in the month, and a local-time
 * parse shifts the whole calendar a day west of UTC.
 */
import { describe, expect, it } from 'vitest';
import {
    addMonths,
    buildMonthGrid,
    compareMonths,
    dayBefore,
    dayKey,
    effectiveDailyStreak,
    monthLabel,
    monthOf,
} from './dailyCalendar';

describe('buildMonthGrid', () => {
    it('pads August 2026 to its Saturday start and fills whole weeks', () => {
        const grid = buildMonthGrid({ year: 2026, month: 8 });
        // 2026-08-01 is a Saturday: six leading nulls.
        expect(grid.slice(0, 6)).toEqual([null, null, null, null, null, null]);
        expect(grid[6]).toBe('2026-08-01');
        expect(grid).toContain('2026-08-31');
        expect(grid.length % 7).toBe(0);
        expect(grid.filter(Boolean)).toHaveLength(31);
    });

    it('starts a Sunday-starting month with no leading nulls', () => {
        // 2026-02-01 is a Sunday.
        const grid = buildMonthGrid({ year: 2026, month: 2 });
        expect(grid[0]).toBe('2026-02-01');
        expect(grid.filter(Boolean)).toHaveLength(28);
    });

    it('gives leap-year February its 29th', () => {
        const grid = buildMonthGrid({ year: 2028, month: 2 });
        expect(grid).toContain('2028-02-29');
        expect(grid.filter(Boolean)).toHaveLength(29);
    });
});

describe('month cursor arithmetic', () => {
    it('addMonths rolls backward across a year boundary', () => {
        expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    });

    it('addMonths rolls forward across a year boundary', () => {
        expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    });

    it('compareMonths orders across years', () => {
        expect(compareMonths({ year: 2025, month: 12 }, { year: 2026, month: 1 })).toBeLessThan(0);
        expect(compareMonths({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(0);
    });

    it('monthOf and monthLabel round-trip a day string without Date parsing', () => {
        expect(monthOf('2026-08-08')).toEqual({ year: 2026, month: 8 });
        expect(monthLabel({ year: 2026, month: 8 })).toBe('August 2026');
    });

    it('dayKey zero-pads', () => {
        expect(dayKey({ year: 2026, month: 3 }, 7)).toBe('2026-03-07');
    });
});

describe('dayBefore', () => {
    it('rolls over month and year boundaries', () => {
        expect(dayBefore('2026-08-01')).toBe('2026-07-31');
        expect(dayBefore('2026-01-01')).toBe('2025-12-31');
        expect(dayBefore('2028-03-01')).toBe('2028-02-29'); // leap
    });
});

describe('effectiveDailyStreak', () => {
    const today = '2026-08-08';

    it('keeps a streak whose last clear was today or yesterday', () => {
        expect(effectiveDailyStreak(5, '2026-08-08', today)).toBe(5);
        expect(effectiveDailyStreak(5, '2026-08-07', today)).toBe(5);
    });

    it('zeroes a streak that missed a day, whatever storage says', () => {
        expect(effectiveDailyStreak(5, '2026-08-05', today)).toBe(0);
    });

    it('treats a future-looking last clear as live, not lapsed (client clock behind server at midnight)', () => {
        expect(effectiveDailyStreak(5, '2026-08-09', today)).toBe(5);
    });

    it('is zero for a player who never cleared one', () => {
        expect(effectiveDailyStreak(0, null, today)).toBe(0);
    });
});
