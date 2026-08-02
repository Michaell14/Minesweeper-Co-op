/**
 * Reading an action lock off the Redis mock.
 *
 * `withLock` does not acquire with the caller's owner string, and does not
 * release with a bare DEL — both for the same reason. A move can outlive its
 * lease, and a release that only names a key would then delete whichever move
 * acquired it next; on a PVP or daily lock, that next move is usually the SAME
 * socket, so the owner alone cannot tell the two apart either. So it acquires
 * with a per-acquisition token and releases through an ownership-checked script.
 *
 * These keep the tests reading like the behaviour they are about rather than
 * like the mechanism, which three files would otherwise each spell out.
 */

/** The value an action lock is held with: this owner, plus a unique suffix. */
const lockedBy = (owner) => expect.stringContaining(owner);

/** Whether the ownership-checked release ran for `key`. */
const releasedLock = (client, key) =>
    client.eval.mock.calls.some(([, options]) => options?.keys?.[0] === key);

module.exports = { lockedBy, releasedLock };
