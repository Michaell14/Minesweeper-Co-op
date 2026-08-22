/**
 * friendships — the social graph, one row per relationship.
 *
 * MUTUAL, not follows: a one-way edge that can invite you into a room is a
 * spam primitive, so a friendship exists only once both sides have agreed.
 *
 * Direction is preserved in the COLUMNS rather than normalised away, because a
 * PENDING row has to know who asked — that is the difference between "you have
 * a request" and "you sent one". "My friends" is therefore the union of both
 * directions where status is 'accepted' (friendsRepo.listGraph). Uniqueness is
 * still over the unordered pair, so only one of the two orientations can exist
 * at a time; see friendships_pair_key.
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

    // One row per UNORDERED pair. Direction is preserved in the columns, but
    // both orientations must never exist at once: `A -> B pending` sitting
    // beside `B -> A blocked` is a block a later accept walks straight through,
    // and it makes "the edge between these two" ambiguous for every read here.
    // The repo already avoids it — the reciprocal (B asks A while A's request
    // to B is pending) accepts the existing row rather than inserting a mirror,
    // and friendsRepo.withPairLock serialises the pair so a request and a block
    // cannot interleave. This index is the backstop under both, so a caller
    // that ever bypasses the lock fails loudly instead of quietly splitting the
    // pair in two.
    //
    // Raw SQL because the uniqueness is over expressions, which
    // pgm.addConstraint cannot express. LEAST/GREATEST on uuid are immutable
    // (uuid_lt is), which is what lets them be indexed.
    pgm.sql(`
        CREATE UNIQUE INDEX friendships_pair_key ON friendships (
            least(requester_id, addressee_id),
            greatest(requester_id, addressee_id)
        )
    `);
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
