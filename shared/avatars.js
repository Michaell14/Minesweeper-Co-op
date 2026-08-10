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
 * `Object.freeze` for the same reason `shared/events.js` freezes: TypeScript
 * infers the literal ids instead of widening them to `string`.
 */

const AVATARS = Object.freeze([
    Object.freeze({ id: 'classic', label: 'Smiley' }),
    Object.freeze({ id: 'puppy', label: 'Puppy' }),
    Object.freeze({ id: 'kitty', label: 'Kitty' }),
    Object.freeze({ id: 'fox', label: 'Fox' }),
    Object.freeze({ id: 'frog', label: 'Frog' }),
    Object.freeze({ id: 'penguin', label: 'Penguin' }),
    Object.freeze({ id: 'robot', label: 'Robot' }),
    Object.freeze({ id: 'ghost', label: 'Ghost' }),
    Object.freeze({ id: 'alien', label: 'Alien' }),
    Object.freeze({ id: 'shinobi', label: 'Shinobi' }),
    Object.freeze({ id: 'pirate', label: 'Pirate' }),
    Object.freeze({ id: 'mushroom', label: 'Mushroom' }),
]);

/** What every account starts as — also the fallback for an unknown stored id. */
const DEFAULT_AVATAR = 'classic';

const AVATAR_IDS = Object.freeze(AVATARS.map((avatar) => avatar.id));

module.exports = { AVATARS, AVATAR_IDS, DEFAULT_AVATAR };
