/**
 * An in-memory Redis stand-in that behaves like a NETWORK: a real store, and
 * every command yields to the event loop before resolving, so two overlapping
 * handlers interleave as they do against a real server (both reads land before
 * either write). mockInfra's canned mock cannot show that race. Values are
 * stringified on write, like Redis.
 */

/** One round trip. setImmediate, not a microtask, so timers and I/O get a turn too. */
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

        /* One field or a list, like node-redis v4; single-field only silently dropped all but the first. */
        hDel: async (key, field) => {
            await tick();
            const hash = store.get(key);
            if (!hash) return 0;
            const fields = Array.isArray(field) ? field : [field];
            let removed = 0;
            for (const f of fields) {
                if (hash[f] === undefined) continue;
                delete hash[f];
                removed++;
            }
            return removed;
        },

        exists: async (key) => {
            await tick();
            return store.has(key) ? 1 : 0;
        },

        del: async (key) => {
            await tick();
            return store.delete(key) ? 1 : 0;
        },

        // SET NX: only the first caller gets 'OK'. TTLs are accepted and ignored.
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
         * Simulates the one script the server runs (data/locks.js's
         * release-if-owned) rather than interpreting Lua; anything else throws.
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
