/**
 * A small deterministic PRNG for the daily challenge's board generation (see
 * the `rng` option on generateBoard in domain/boardGen.js). Pure: the same
 * seed gives the same sequence, so every player gets byte-identical boards.
 */

/** djb2 string hash, folded into an unsigned 32-bit seed. */
const hashStringToSeed = (str) => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // hash * 33 + c
    }
    return hash >>> 0;
};

/** mulberry32: returns a `() => number in [0, 1)` whose closure holds the state. */
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
