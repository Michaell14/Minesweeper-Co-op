/**
 * users.avatar — the chosen profile picture, one id from shared/avatars.js.
 *
 * A TEXT id rather than an enum: the catalog lives in code and grows with it,
 * and an enum would need a migration per new avatar. The server validates
 * writes against the catalog (validation.js); a stored id the client no longer
 * knows falls back to the default at render time rather than erroring.
 */

exports.up = (pgm) => {
    pgm.addColumn('users', {
        avatar: { type: 'text', notNull: true, default: 'classic' },
    });
};

exports.down = (pgm) => {
    pgm.dropColumn('users', 'avatar');
};
