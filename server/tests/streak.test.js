/** The day-streak maths, pure: a day-boundary off-by-one would be a plausible, wrong number forever. */

const { advanceStreak, dayBefore, streaksFromDays, utcDayOf } = require('../domain/streak');

describe('utcDayOf', () => {
    test('is the UTC day, not the local one', () => {
        // 2026-08-02T23:30Z is already Aug 3rd in Sydney and still Aug 2nd in LA.
        expect(utcDayOf(Date.UTC(2026, 7, 2, 23, 30))).toBe('2026-08-02');
        expect(utcDayOf(Date.UTC(2026, 7, 3, 0, 0, 1))).toBe('2026-08-03');
    });
});

describe('dayBefore', () => {
    test.each([
        ['2026-08-02', '2026-08-01'],
        ['2026-08-01', '2026-07-31'], // month boundary
        ['2026-01-01', '2025-12-31'], // year boundary
        ['2028-03-01', '2028-02-29'], // leap day
    ])('%s → %s', (day, expected) => {
        expect(dayBefore(day)).toBe(expected);
    });
});

describe('advanceStreak', () => {
    const fresh = { currentStreak: 0, bestStreak: 0, lastPlayedDay: null };

    test('the first game ever starts a streak of 1', () => {
        expect(advanceStreak(fresh, '2026-08-02')).toEqual({
            currentStreak: 1,
            bestStreak: 1,
            lastPlayedDay: '2026-08-02',
        });
    });

    test('a second game the same day changes nothing', () => {
        const s = advanceStreak(fresh, '2026-08-02');
        expect(advanceStreak(s, '2026-08-02')).toEqual(s);
    });

    test('the next day extends, across month boundaries too', () => {
        let s = advanceStreak(fresh, '2026-07-31');
        s = advanceStreak(s, '2026-08-01');
        expect(s.currentStreak).toBe(2);
        expect(s.bestStreak).toBe(2);
    });

    test('a missed day resets to 1 but keeps the best', () => {
        let s = { currentStreak: 5, bestStreak: 5, lastPlayedDay: '2026-08-02' };
        s = advanceStreak(s, '2026-08-04'); // skipped the 3rd
        expect(s).toEqual({ currentStreak: 1, bestStreak: 5, lastPlayedDay: '2026-08-04' });
    });

    test('an out-of-order older result never destroys a live streak', () => {
        const s = { currentStreak: 5, bestStreak: 7, lastPlayedDay: '2026-08-02' };
        expect(advanceStreak(s, '2026-07-30')).toEqual(s);
    });

    test('a stored zero on the same day heals to 1 rather than staying 0', () => {
        const odd = { currentStreak: 0, bestStreak: 0, lastPlayedDay: '2026-08-02' };
        expect(advanceStreak(odd, '2026-08-02').currentStreak).toBe(1);
    });
});

describe('streaksFromDays', () => {
    test('no days: zeros and no last day', () => {
        expect(streaksFromDays([])).toEqual({ currentStreak: 0, bestStreak: 0, lastPlayedDay: null });
    });

    test('a single day is a streak of 1', () => {
        expect(streaksFromDays(['2026-08-02'])).toEqual({
            currentStreak: 1, bestStreak: 1, lastPlayedDay: '2026-08-02',
        });
    });

    test('current is the run ending at the newest day', () => {
        const s = streaksFromDays(['2026-08-04', '2026-08-03', '2026-08-01']);
        expect(s).toEqual({ currentStreak: 2, bestStreak: 2, lastPlayedDay: '2026-08-04' });
    });

    test('best can live in an older run than current', () => {
        const s = streaksFromDays(['2026-08-09', '2026-08-04', '2026-08-03', '2026-08-02']);
        expect(s).toEqual({ currentStreak: 1, bestStreak: 3, lastPlayedDay: '2026-08-09' });
    });

    test('runs join across month boundaries', () => {
        const s = streaksFromDays(['2026-08-01', '2026-07-31', '2026-07-30']);
        expect(s.currentStreak).toBe(3);
    });

    test('the out-of-order repair: a late-arriving middle day joins its neighbours', () => {
        // Won the 1st and 3rd, then the 2nd lands late: derived from the full set it is a 3-run.
        const s = streaksFromDays(['2026-08-03', '2026-08-02', '2026-08-01']);
        expect(s).toEqual({ currentStreak: 3, bestStreak: 3, lastPlayedDay: '2026-08-03' });
    });
});
