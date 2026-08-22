/**
 * The emote catalog — ids and labels, the one copy imported by BOTH halves:
 * the client via `@/shared/emotes`, the server via `require('../shared/emotes')`.
 * CommonJS for the same reason as boardConfig, events and avatars — see
 * ARCHITECTURE.md §6.
 *
 * Ids and labels only, the same split as `shared/avatars.js`: the server needs
 * the id list to validate what it fans out, and the ART is client-only drawing
 * (`components/ds/emoteArt.ts`, keyed by these ids; a client test fails if the
 * two drift).
 *
 * A FIXED vocabulary is the whole design. Free text would need a profanity
 * filter, a report flow and someone to read the reports — none of which this
 * project has — so what a player can say is a closed set of six drawn glyphs
 * chosen to cover what actually gets said over a shared board.
 *
 * `label` is the accessible name of the tray button AND what a screen reader
 * announces on receipt ("Alex: Nice"), so it reads as a thing said, not as a
 * picture description.
 *
 * `Object.freeze` for the same reason `shared/events.js` freezes: TypeScript
 * infers the literal ids instead of widening them to `string`.
 */

const EMOTES = Object.freeze([
    Object.freeze({ id: 'wave', label: 'Hello' }),
    Object.freeze({ id: 'nice', label: 'Nice' }),
    Object.freeze({ id: 'unsure', label: 'Not sure' }),
    Object.freeze({ id: 'careful', label: 'Careful' }),
    Object.freeze({ id: 'hurry', label: 'Hurry' }),
    Object.freeze({ id: 'thanks', label: 'Thanks' }),
]);

const EMOTE_IDS = Object.freeze(EMOTES.map((emote) => emote.id));

/** The label for an id, or null if nothing in the catalog matches. */
const emoteLabel = (id) => {
    const emote = EMOTES.find((entry) => entry.id === id);
    return emote ? emote.label : null;
};

module.exports = { EMOTES, EMOTE_IDS, emoteLabel };
