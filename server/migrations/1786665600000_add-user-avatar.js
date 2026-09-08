/**
 * users.avatar: one id from shared/avatars.js. TEXT rather than an enum, so a
 * new avatar needs no migration; the server validates writes against the
 * catalog, and an unknown stored id falls back to the default at render time.
 */

exports.up = (pgm) => {
    pgm.addColumn('users', {
        avatar: { type: 'text', notNull: true, default: 'classic' },
    });
};

exports.down = (pgm) => {
    pgm.dropColumn('users', 'avatar');
};
