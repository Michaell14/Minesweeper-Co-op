/**
 * friendships — the social graph, one row per relationship. MUTUAL, not
 * follows: a one-way edge that can invite you into a room is a spam primitive.
 * Direction is kept in the COLUMNS because a PENDING row has to know who
 * asked; "my friends" is the union of both directions where status is
 * 'accepted' (friendsRepo.listGraph), and uniqueness is over the unordered
 * pair (friendships_pair_key). A BLOCK is stored on the blocker's row and
 * first deletes whatever the pair had. ON DELETE CASCADE on both sides keeps
 * `userRepo.deleteUser` the single deletion point.
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

    // One row per UNORDERED pair: `A -> B pending` beside `B -> A blocked` is a
    // block a later accept walks through. The repo already avoids it (the
    // reciprocal accepts the existing row, withPairLock serialises the pair);
    // this is the backstop, so a caller bypassing the lock fails loudly.
    // Raw SQL because pgm.addConstraint cannot express uniqueness over
    // expressions; LEAST/GREATEST on uuid are immutable, so indexable.
    pgm.sql(`
        CREATE UNIQUE INDEX friendships_pair_key ON friendships (
            least(requester_id, addressee_id),
            greatest(requester_id, addressee_id)
        )
    `);
    pgm.addConstraint('friendships', 'friendships_distinct_users', {
        check: 'requester_id <> addressee_id',
    });
    // The vocabulary lives here as well as in the repo, so a typo'd status is rejected.
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
