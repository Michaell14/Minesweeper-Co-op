/**
 * Whose name goes on the scoreboard. Both failures are quiet: a signed-in
 * player under whatever they typed, or a signed-out one bounced with an empty string.
 */
const { displayNameFor } = require('../utils/playerIdentity');

const socketFor = (user) => ({ data: user ? { user } : {} });

describe('displayNameFor', () => {
    test('a signed-in player is their account, whatever they typed', () => {
        const socket = socketFor({ id: 'uuid-1', displayName: 'Miguel' });
        expect(displayNameFor(socket, 'Somebody Else')).toBe('Miguel');
    });

    test('a signed-out player is what they typed', () => {
        expect(displayNameFor(socketFor(null), 'Guest')).toBe('Guest');
    });

    /*
     * The client can believe it is signed in while the handshake's token did
     * not resolve here; it skips its name dialog, so the typed name must stand.
     */
    test('falls back to the typed name when the account did not resolve', () => {
        expect(displayNameFor(socketFor(null), 'Miguel')).toBe('Miguel');
    });

    test('an account with no display name still falls back', () => {
        const socket = socketFor({ id: 'uuid-1', displayName: '' });
        expect(displayNameFor(socket, 'Guest')).toBe('Guest');
    });

    // An OAuth-seeded name is still arbitrary input and gets the same treatment as a typed one.
    test('normalises the account name like any other', () => {
        expect(displayNameFor(socketFor({ displayName: '  Miguel  ' }), 'x')).toBe('Miguel');
    });

    test('gives callers an empty string to reject when there is nothing at all', () => {
        expect(displayNameFor(socketFor(null), undefined)).toBe('');
        expect(displayNameFor(undefined, undefined)).toBe('');
    });
});
