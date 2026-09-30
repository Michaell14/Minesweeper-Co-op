import { describe, expect, test } from 'vitest';
import { MAX_JOIN_ROOM_CODE_LENGTH, parseRoomInput } from './roomLink';

describe('pasted room codes and invite links', () => {
    test('trims surrounding whitespace without changing a case-sensitive code', () => {
        expect(parseRoomInput('  Calm-Otter  ')).toEqual({ room: 'Calm-Otter' });
        expect(parseRoomInput('A room / & friends')).toEqual({ room: 'A room / & friends' });
    });

    test('extracts and decodes a link without truncating it to the old field length', () => {
        expect(parseRoomInput(' https://minesweeper.example/?room=My%20Room%2BOne&other=value '))
            .toEqual({ room: 'My Room+One' });
    });

    test('accepts existing codes up to the server limit', () => {
        const room = 'a'.repeat(MAX_JOIN_ROOM_CODE_LENGTH);
        expect(parseRoomInput(room)).toEqual({ room });
        expect(parseRoomInput(`https://example.com/?room=${room}`)).toEqual({ room });
    });

    test.each(['', '   ', 'https://example.com/?room=%20%20'])('rejects a missing code: %j', (input) => {
        expect(parseRoomInput(input)).toEqual({ error: 'Enter a room code or paste an invite link.' });
    });

    test.each(['a'.repeat(101), `https://example.com/?room=${'a'.repeat(101)}`])('rejects an overlong code', (input) => {
        expect(parseRoomInput(input)).toEqual({ error: 'Room codes must be 100 characters or fewer.' });
    });

    test('explains links without a room and malformed links', () => {
        expect(parseRoomInput('https://example.com/')).toEqual({ error: 'This link does not contain a room code.' });
        expect(parseRoomInput('https://?room=test')).toEqual({ error: 'Enter a room code or a valid invite link.' });
    });
});
