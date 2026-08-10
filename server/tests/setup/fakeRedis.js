/**
 * An in-memory stand-in for the Redis client that behaves like a NETWORK.
 *
 * The global mock in mockInfra.js hands back canned values with no store behind
 * them, which is what most tests want. It cannot show a read-modify-write race,
 * for two reasons: nothing a test writes is ever read back, and every command
 * settles in call order.
 *
 * This one keeps a real store and makes every command yield to the event loop
 * before it resolves, so two overlapping handlers interleave the way they do
 * against a real server: both reads land before either write.
 *
 * Values are stringified on write, like Redis — booleans and numbers come back
 * out as 'true' / '3'.
 */

/** One round trip. setImmediate, not a bare microtask, so timers and I/O in the
 *  code under test get a turn too. */
const tick = () => new Promise((resolve) => setImmediate(resolve));

const createFakeRedis = () => {
    const store = new Map();
    const lockAttempts = [];

    const hashAt = (key) => {
        if (!store.has(key)) store.set(key, {});
        return store.get(key);
    };

    return {
        /** Every key a SET NX was attempted on, in order — for asserting on locking. */
        locksTaken: () => [...lockAttempts],

        /** Seed a hash synchronously, before the code under test starts. */
        seed: (key, fields) => {
            store.set(key, Object.fromEntries(
                Object.entries(fields).map(([k, v]) => [k, String(v)])
            ));
        },

        /** Read a hash synchronously, for assertions. */
        read: (key) => ({ ...(store.get(key) || {}) }),

        flush: () => {
            store.clear();
            lockAttempts.length = 0;
        },

        hGetAll: async (key) => {
            await tick();
            return { ...(store.get(key) || {}) };
        },

        hGet: async (key, field) => {
            await tick();
            const hash = store.get(key);
            return hash && hash[field] !== undefined ? hash[field] : null;
        },

        hmGet: async (key, fields) => {
            await tick();
            const hash = store.get(key);
            return fields.map((field) =>
                hash && hash[field] !== undefined ? hash[field] : null,
            );
        },

        hSet: async (key, fields) => {
            await tick();
            const hash = hashAt(key);
            for (const [field, value] of Object.entries(fields)) {
                hash[field] = String(value);
            }
            return Object.keys(fields).length;
        },

        hDel: async (key, field) => {
            await tick();
            const hash = store.get(key);
            if (!hash || hash[field] === undefined) return 0;
            delete hash[field];
            return 1;
        },

        exists: async (key) => {
            await tick();
            return store.has(key) ? 1 : 0;
        },

        del: async (key) => {
            await tick();
            return store.delete(key) ? 1 : 0;
        },

        // SET NX: only the first caller gets 'OK'. TTLs are accepted and ignored
        // — no test here holds a lock long enough for one to matter.
        set: async (key, value, options = {}) => {
            await tick();
            if (options.NX) lockAttempts.push(key);
            if (options.NX && store.has(key)) return null;
            store.set(key, String(value));
            return 'OK';
        },

        expire: async () => {
            await tick();
            return 1;
        },

        /*
         * The only script the server runs is data/locks.js's release-if-owned,
         * so this simulates that one rather than interpreting Lua: delete
         * KEYS[0] iff it still holds ARGV[0]. Getting this wrong in the fake
         * would hide exactly the bug the real script exists to prevent, so it
         * asserts rather than guessing at anything else.
         */
        eval: async (script, { keys = [], arguments: args = [] } = {}) => {
            await tick();
            if (!script.includes('redis.call("del", KEYS[1])')) {
                throw new Error('fakeRedis.eval only implements the release-if-owned script');
            }
            if (store.get(keys[0]) !== args[0]) return 0;
            store.delete(keys[0]);
            return 1;
        },

        ping: async () => 'PONG',
    };
};

module.exports = { createFakeRedis };
