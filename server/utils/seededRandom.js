/**
 * A small deterministic PRNG, used only by the daily challenge's board
 * generation (server/game/daily.js). Regular rooms keep using Math.random()
 * unchanged — see the `rng` parameter on generateBoard in gameUtils.js.
 *
 * Pure, dependency-free. Same seed -> identical output sequence, every time,
 * from a cold call — that is the entire point: it is what lets every player
 * receive byte-identical daily boards.
 */

/** djb2 string hash, folded into an unsigned 32-bit seed. */
const hashStringToSeed = (str) => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // hash * 33 + c
    }
    return hash >>> 0;
};

/**
 * mulberry32: returns a `() => number in [0, 1)` generator function. The
 * returned function is itself the RNG state — call it repeatedly for a
 * deterministic sequence keyed only by `seed`.
 */
const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

module.exports = { hashStringToSeed, mulberry32 };
