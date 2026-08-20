/**
 * The avatar catalog — ids and labels, the one copy imported by BOTH halves:
 * the client via `@/shared/avatars`, the server via `require('../shared/avatars')`.
 * CommonJS for the same reason as boardConfig and events — see ARCHITECTURE.md §6.
 *
 * Ids and labels only: the server needs just the id list to validate what it
 * stores in `users.avatar`, and holding the ART here would put ~200 lines of
 * client-only drawing in every server require. The art lives in
 * `components/ds/avatarArt.ts`, keyed by these ids; a client test fails if the
 * two sets drift.
 *
 * Unlike sprite sets there are no seasonal avatars, deliberately: an avatar is
 * DATA (who you are), not paint, so nothing here may auto-swap with a holiday
 * window (CLAUDE.md trap 11 is about exactly that distinction).
 *
 * `requires` names an achievement from shared/achievements.js, or is null for
 * the ones anyone may wear. The RULE for reading it is `canUseAvatar` below,
 * shared so the lock the picker draws and the lock the server enforces cannot
 * disagree — the picker is a courtesy, the server is the gate.
 *
 * `Object.freeze` for the same reason `shared/events.js` freezes: TypeScript
 * infers the literal ids instead of widening them to `string`.
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
     * Earned. One per axis on purpose, so no single mode gates the lot: a
     * hundred races, fifty co-op wins, a thirty-day daily streak, a hundred
     * boards. None is hidden — a requirement nobody can read is a locked door
     * with no keyhole.
     *
     * These are all NEW ids. Gating a face people already wear would strand
     * them the moment they switched away, which is also why `canUseAvatar`
     * keeps letting you wear what you already have.
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
 * May this account wear this avatar? The one rule, three clauses:
 *
 *   1. it asks for nothing, or
 *   2. they have earned what it asks, or
 *   3. they are already wearing it.
 *
 * The third clause is the one that is easy to leave out and expensive to add
 * back. Achievements are insert-only, so nothing can un-earn — but a face that
 * became gated AFTER someone chose it would otherwise be theirs to keep and
 * never to re-pick, one silent 403 at a time.
 *
 * Validity is a separate question: `isValidAvatarId` asks whether an id is
 * DRAWABLE, which is what the daily leaderboard needs when it renders somebody
 * else's face. Fold entitlement into that and every earned avatar disappears
 * from the leaderboard for everyone but its owner.
 *
 * Annotated because TypeScript reads this file directly (`allowJs`) and would
 * otherwise infer the parameter types from the DEFAULTS — `current: null`,
 * which rejects every real caller.
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
