/**
 * Whose name goes on the scoreboard.
 *
 * The failure this guards is quiet in both directions: a signed-in player
 * appearing under whatever they typed (their account face over an invented
 * name), or a signed-out player being handed an empty string and bounced from
 * a room with no explanation.
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
     * not resolve here — an expired bridge token, Postgres down. It skips its
     * name dialog on that belief, so the typed name it sends is the account
     * name it knows, and this must not drop it on the floor.
     */
    test('falls back to the typed name when the account did not resolve', () => {
        expect(displayNameFor(socketFor(null), 'Miguel')).toBe('Miguel');
    });

    test('an account with no display name still falls back', () => {
        const socket = socketFor({ id: 'uuid-1', displayName: '' });
        expect(displayNameFor(socket, 'Guest')).toBe('Guest');
    });

    // An OAuth-seeded name is still arbitrary input: it gets the same
    // treatment a typed one does, and callers still validate what comes back.
    test('normalises the account name like any other', () => {
        expect(displayNameFor(socketFor({ displayName: '  Miguel  ' }), 'x')).toBe('Miguel');
    });

    test('gives callers an empty string to reject when there is nothing at all', () => {
        expect(displayNameFor(socketFor(null), undefined)).toBe('');
        expect(displayNameFor(undefined, undefined)).toBe('');
    });
});
