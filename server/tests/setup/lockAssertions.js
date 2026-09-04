/**
 * Reading an action lock off the Redis mock. `withLock` acquires with a
 * per-acquisition token and releases through an ownership-checked script (a
 * move can outlive its lease), so tests match on the owner and on the script.
 */

/** The value an action lock is held with: this owner, plus a unique suffix. */
const lockedBy = (owner) => expect.stringContaining(owner);

/** Whether the ownership-checked release ran for `key`. */
const releasedLock = (client, key) =>
    client.eval.mock.calls.some(([, options]) => options?.keys?.[0] === key);

module.exports = { lockedBy, releasedLock };
