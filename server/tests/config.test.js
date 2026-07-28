/**
 * Tests for server/config.js — origin parsing.
 *
 * The fallback behaviour matters: an unset or malformed ALLOWED_ORIGINS must
 * degrade to the previously hardcoded list, not to an empty list, which would
 * silently refuse every browser.
 */

const { parseOrigins, DEFAULT_ALLOWED_ORIGINS } = require('../config');

describe('parseOrigins', () => {
    test('splits a comma-separated list', () => {
        expect(parseOrigins('https://a.com,https://b.com')).toEqual(['https://a.com', 'https://b.com']);
    });

    test('trims surrounding whitespace', () => {
        expect(parseOrigins(' https://a.com , https://b.com ')).toEqual(['https://a.com', 'https://b.com']);
    });

    test('drops blank entries from trailing or doubled commas', () => {
        expect(parseOrigins('https://a.com,,https://b.com,')).toEqual(['https://a.com', 'https://b.com']);
    });

    test('accepts a single origin', () => {
        expect(parseOrigins('https://only.example')).toEqual(['https://only.example']);
    });

    test.each([
        ['undefined', undefined],
        ['null', null],
        ['a number', 3000],
        ['an empty string', ''],
        ['only whitespace', '   '],
        ['only commas', ',,,'],
    ])('falls back to the defaults for %s rather than locking everyone out', (_label, raw) => {
        expect(parseOrigins(raw)).toEqual(DEFAULT_ALLOWED_ORIGINS);
    });

    test('an explicit fallback is honoured', () => {
        expect(parseOrigins(undefined, ['https://custom'])).toEqual(['https://custom']);
    });

    test('the defaults still include production and local dev', () => {
        expect(DEFAULT_ALLOWED_ORIGINS).toContain('https://www.minesweepercoop.com');
        expect(DEFAULT_ALLOWED_ORIGINS).toContain('http://localhost:3000');
    });
});
