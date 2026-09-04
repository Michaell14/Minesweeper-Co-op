/**
 * The room code a player is offered before they type one. An empty field made
 * people invent codes, and two inventing at once collided. Two words rather
 * than random characters: a code has to survive being read aloud and retyped.
 */

/**
 * The longest code the field accepts, tighter than the server's 100
 * (MAX_ROOM_CODE_LENGTH in server/validation.js). Every generated code fits.
 */
export const MAX_ROOM_CODE_LENGTH = 28;

/*
 * 48 x 48 is 2304 pairs; a small list would collide like the empty field did.
 * Plain, unambiguous words that survive being spelled out.
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

/** A suggested room code, e.g. `brave-otter`. Never longer than MAX_ROOM_CODE_LENGTH. */
export function generateRoomCode(): string {
    return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}
