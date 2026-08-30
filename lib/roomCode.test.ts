/**
 * The suggested room code.
 *
 * Pure string work, so no DOM. It is worth testing because every failure here
 * is quiet: a code that collides constantly, or one the server rejects for
 * length, both look like a working Create button that just does not work.
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
     * The point of the feature. Two people pressing Create at the same moment
     * is exactly the collision the generator exists to avoid, so a generator
     * that returned a handful of values would be worse than the empty field it
     * replaced.
     */
    test('spreads over enough of the space to make a collision unlikely', () => {
        const seen = new Set<string>();
        for (let i = 0; i < 500; i++) seen.add(generateRoomCode());
        expect(seen.size).toBeGreaterThan(400);
    });
});
