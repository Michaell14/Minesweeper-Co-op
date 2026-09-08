/**
 * The emote catalog: ids and labels, imported by BOTH halves (CommonJS, like
 * boardConfig and events; see ARCHITECTURE.md §6). The ART is client-only
 * (`components/ds/emoteArt.ts`, keyed by these ids). A FIXED vocabulary is the
 * design: free text would need moderation this project does not have. `label`
 * is the tray button's accessible name and what a screen reader announces on
 * receipt ("Alex: Nice"). Frozen, like `shared/events.js`, so TypeScript
 * infers the literal ids.
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
