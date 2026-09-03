/**
 * The suggested room code. Every failure here is quiet: a code that collides,
 * or one the server rejects for length, looks like a Create button that does
 * not work.
 */

import { describe, expect, test } from 'vitest';
import { MAX_ROOM_CODE_LENGTH, generateRoomCode } from './roomCode';

describe('generateRoomCode', () => {
    test('reads as two lowercase words joined by a hyphen', () => {
        for (let i = 0; i < 200; i++) {
            expect(generateRoomCode()).toMatch(/^[a-z]+-[a-z]+$/);
        }
    });

    test('stays inside the length the field accepts', () => {
        for (let i = 0; i < 200; i++) {
            const code = generateRoomCode();
            expect(code.length).toBeGreaterThan(0);
            expect(code.length).toBeLessThanOrEqual(MAX_ROOM_CODE_LENGTH);
        }
    });

    /*
     * The point of the feature: a generator returning a handful of values would
     * collide like the empty field it replaced.
     */
    test('spreads over enough of the space to make a collision unlikely', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 500; i++) seen.add(generateRoomCode());
        expect(seen.size).toBeGreaterThan(400);
    });
});
