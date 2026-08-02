/**
 * Tests for server/domain/seededRandom.js — the daily challenge's PRNG.
 *
 * Pure, no mocks: the entire contract this file exists for is "same seed in,
 * identical sequence out," since that is what lets every player receive a
 * byte-identical daily board.
 */

const { hashStringToSeed, mulberry32 } = require('../domain/seededRandom');

describe('hashStringToSeed', () => {
    test('is deterministic for the same string', () => {
        expect(hashStringToSeed('minesweeper-daily:2026-07-30')).toBe(
            hashStringToSeed('minesweeper-daily:2026-07-30')
        );
    });

    test('different strings hash to different seeds', () => {
        expect(hashStringToSeed('minesweeper-daily:2026-07-30')).not.toBe(
            hashStringToSeed('minesweeper-daily:2026-07-31')
        );
    });

    test('always returns an unsigned 32-bit integer', () => {
        for (const str of ['', 'a', 'minesweeper-daily:2026-07-30', 'x'.repeat(500)]) {
            const seed = hashStringToSeed(str);
            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThanOrEqual(0xffffffff);
        }
    });
});

describe('mulberry32', () => {
    test('the same seed produces an identical sequence across fresh instances', () => {
        const a = mulberry32(12345);
        const b = mulberry32(12345);

        const seqA = Array.from({ length: 50 }, () => a());
        const seqB = Array.from({ length: 50 }, () => b());

        expect(seqA).toEqual(seqB);
    });

    test('different seeds produce different sequences', () => {
        const a = mulberry32(1);
        const b = mulberry32(2);

        const seqA = Array.from({ length: 10 }, () => a());
        const seqB = Array.from({ length: 10 }, () => b());

        expect(seqA).not.toEqual(seqB);
    });

    test('every output stays in [0, 1)', () => {
        const rng = mulberry32(hashStringToSeed('minesweeper-daily:2026-07-30'));

        for (let i = 0; i < 1000; i++) {
            const value = rng();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    test('the same instance advances -- successive calls differ', () => {
        const rng = mulberry32(42);
        const first = rng();
        const second = rng();

        expect(first).not.toBe(second);
    });
});
