/**
 * users.friend_code, the handle somebody else types to add you. NULLABLE and
 * generated on first read (`getOrCreateFriendCode`) rather than backfilled,
 * since most accounts never use friends. UNIQUE makes the lookup a lookup;
 * see server/domain/friendCode.js for the alphabet.
 */

exports.up = (pgm) => {
    pgm.addColumn('users', {
        friend_code: { type: 'text' },
    });
    pgm.addConstraint('users', 'users_friend_code_key', { unique: ['friend_code'] });
};

exports.down = (pgm) => {
    pgm.dropConstraint('users', 'users_friend_code_key');
    pgm.dropColumn('users', 'friend_code');
};
