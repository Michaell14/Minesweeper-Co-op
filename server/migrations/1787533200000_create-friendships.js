/**
 * friendships — the social graph, one row per relationship.
 *
 * MUTUAL, not follows: a one-way edge that can invite you into a room is a
 * spam primitive, so a friendship exists only once both sides have agreed.
 *
 * Direction is preserved rather than normalised into (least, greatest) because
 * a PENDING row has to know who asked — that is the difference between "you
 * have a request" and "you sent one". "My friends" is therefore the union of
 * both directions where status is 'accepted' (friendsRepo.listGraph).
 *
 * A BLOCK is stored on the blocker's row, and blocking first deletes whatever
 * the pair already had: leaving an accepted row behind would keep two people
 * listed as friends while one of them had blocked the other.
 *
 * ON DELETE CASCADE on both sides, so `userRepo.deleteUser` stays the single
 * deletion point — deleting an account takes its edges with it, in both
 * directions.
 */

exports.up = (pgm) => {
    pgm.createTable('friendships', {
        id: 'id',
        requester_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
        addressee_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
        status: { type: 'text', notNull: true },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
        responded_at: { type: 'timestamptz' },
    });

    // One row per ORDERED pair. The reciprocal (B asks A while A's request to B
    // is pending) is handled in the repo, which accepts the existing row rather
    // than inserting a second one — see requestFriend.
    pgm.addConstraint('friendships', 'friendships_pair_key', {
        unique: ['requester_id', 'addressee_id'],
    });
    pgm.addConstraint('friendships', 'friendships_distinct_users', {
        check: 'requester_id <> addressee_id',
    });
    // The status vocabulary lives here as well as in the repo: a typo'd status
    // would otherwise be a row that no query matches and nothing rejects.
    pgm.addConstraint('friendships', 'friendships_status_check', {
        check: "status IN ('pending', 'accepted', 'blocked')",
    });

    // Every query starts from one user and looks in both directions.
    pgm.createIndex('friendships', ['requester_id', 'status']);
    pgm.createIndex('friendships', ['addressee_id', 'status']);
};

exports.down = (pgm) => {
    pgm.dropTable('friendships');
};
