/**
 * The room code a player is offered before they type one.
 *
 * An empty field asked people to invent a code, and two of them inventing at
 * once collided — which surfaced as an error dialog with nothing to do next.
 * A suggestion costs nothing to accept and is still fully editable.
 *
 * Two words rather than five random characters: a room code's job is to survive
 * being read aloud over voice chat and retyped by someone else.
 */

/**
 * The longest code the field accepts. Tighter than the server's own limit
 * (MAX_ROOM_CODE_LENGTH in server/validation.js, 100) on purpose — this is the
 * bound the two forms hand to `maxLength`, and every generated code fits it.
 */
export const MAX_ROOM_CODE_LENGTH = 28;

/*
 * 48 x 48 is 2304 pairs. The size is the feature: the generator exists to make
 * two simultaneous Creates land on different codes, so a small list would be no
 * better than the empty field. Kept to plain, unambiguous words that survive
 * being spelled out.
 */
const ADJECTIVES = [
    'amber', 'brave', 'brisk', 'calm', 'clever', 'cosmic', 'crisp', 'daring',
    'dusty', 'eager', 'early', 'fabled', 'fearless', 'fleet', 'gentle', 'giddy',
    'golden', 'grand', 'happy', 'hidden', 'humble', 'ideal', 'jolly', 'keen',
    'lucky', 'merry', 'mighty', 'nimble', 'noble', 'polite', 'proud', 'quiet',
    'rapid', 'royal', 'rugged', 'sharp', 'silent', 'silver', 'sleepy', 'solid',
    'spry', 'steady', 'sunny', 'swift', 'tidy', 'vivid', 'witty', 'zesty',
];

const NOUNS = [
    'acorn', 'anchor', 'badger', 'beacon', 'bishop', 'boulder', 'canyon', 'cedar',
    'comet', 'compass', 'copper', 'crater', 'dolphin', 'ember', 'falcon', 'ferret',
    'forest', 'garnet', 'glacier', 'harbor', 'heron', 'island', 'jasper', 'kestrel',
    'lantern', 'ledger', 'lizard', 'magnet', 'marble', 'meadow', 'mineral', 'orbit',
    'otter', 'pebble', 'pilot', 'quarry', 'raven', 'ribbon', 'river', 'saddle',
    'sparrow', 'summit', 'thicket', 'tundra', 'valley', 'walrus', 'willow', 'zephyr',
];

/** A random element. Extracted only so the two picks read the same. */
const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/**
 * A suggested room code, e.g. `brave-otter`. Never longer than
 * MAX_ROOM_CODE_LENGTH — the longest pair in the lists above is well inside it.
 */
export function generateRoomCode(): string {
    return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}
