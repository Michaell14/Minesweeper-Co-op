/**
 * The avatar catalog — ids and labels only, imported by BOTH halves (CommonJS
 * for the same reason as boardConfig and events, ARCHITECTURE.md §6). The art
 * lives in `components/ds/avatarArt.ts`, keyed by these ids, so the server does
 * not require ~200 lines of drawing; a client test fails if the two drift.
 *
 * No seasonal avatars: an avatar is DATA (who you are), not paint, so nothing
 * here may auto-swap with a holiday window (CLAUDE.md trap 11).
 *
 * `requires` names an achievement from shared/achievements.js, or null. The
 * rule for reading it is `canUseAvatar`, shared so the picker's lock and the
 * server's gate cannot disagree. `Object.freeze` so TypeScript infers the
 * literal ids, as in `shared/events.js`.
 */

const AVATARS = Object.freeze([
    Object.freeze({ id: 'classic', label: 'Smiley', requires: null }),
    Object.freeze({ id: 'puppy', label: 'Puppy', requires: null }),
    Object.freeze({ id: 'kitty', label: 'Kitty', requires: null }),
    Object.freeze({ id: 'fox', label: 'Fox', requires: null }),
    Object.freeze({ id: 'frog', label: 'Frog', requires: null }),
    Object.freeze({ id: 'penguin', label: 'Penguin', requires: null }),
    Object.freeze({ id: 'robot', label: 'Robot', requires: null }),
    Object.freeze({ id: 'ghost', label: 'Ghost', requires: null }),
    Object.freeze({ id: 'alien', label: 'Alien', requires: null }),
    Object.freeze({ id: 'shinobi', label: 'Shinobi', requires: null }),
    Object.freeze({ id: 'pirate', label: 'Pirate', requires: null }),
    Object.freeze({ id: 'mushroom', label: 'Mushroom', requires: null }),

    /*
     * Earned, one per axis so no single mode gates the lot, and none hidden.
     * All NEW ids: gating a face people already wear would strand them, which
     * is also why `canUseAvatar` keeps letting you wear what you have.
     */
    Object.freeze({ id: 'shark', label: 'Shark', requires: 'apex-predator' }),
    Object.freeze({ id: 'bee', label: 'Bee', requires: 'fully-cooperative' }),
    Object.freeze({ id: 'sun', label: 'Sun', requires: 'month-streak' }),
    Object.freeze({ id: 'knight', label: 'Knight', requires: 'veteran' }),
]);

/** What every account starts as — also the fallback for an unknown stored id. */
const DEFAULT_AVATAR = 'classic';

const AVATAR_IDS = Object.freeze(AVATARS.map((avatar) => avatar.id));

/** The achievement an avatar is locked behind, or null if anyone may wear it. */
const requirementFor = (id) => {
    const avatar = AVATARS.find((entry) => entry.id === id);
    return avatar ? avatar.requires : null;
};

/**
 * May this account wear this avatar? Yes if it asks for nothing, if they have
 * earned what it asks, or if they are already wearing it. The third clause
 * matters: a face gated AFTER someone chose it would otherwise be theirs to
 * keep and never re-pick. Entitlement is separate from validity —
 * `isValidAvatarId` asks whether an id is DRAWABLE, which the leaderboard
 * needs for other people's faces.
 *
 * Annotated because TypeScript reads this file (`allowJs`) and would infer the
 * parameter types from the defaults (`current: null`).
 *
 * @param {string} id
 * @param {{ earned?: string[], current?: string | null }} [account]
 * @returns {boolean}
 */
const canUseAvatar = (id, { earned = [], current = null } = {}) => {
    const required = requirementFor(id);
    return !required || earned.includes(required) || id === current;
};

module.exports = { AVATARS, AVATAR_IDS, DEFAULT_AVATAR, requirementFor, canUseAvatar };
