/**
 * users.friend_code — the handle somebody else types to add you.
 *
 * NULLABLE and generated on first read rather than backfilled: most accounts
 * will never use friends, a backfill would mint a code for every one of them,
 * and a nullable column lets `getOrCreateFriendCode` be the single place a code
 * comes into existence. UNIQUE is what makes the lookup a lookup — see
 * server/domain/friendCode.js for the alphabet and why it omits O/0/I/1.
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
