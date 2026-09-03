/**
 * Timing and wording for the reaction feed. Pure, so the handler, component
 * and tests read the same numbers. The catalog is `shared/emotes.js`.
 */
import { emoteLabel } from "@/shared/emotes";

/**
 * How long a reaction stays on screen. A TIMER, not an animation: the
 * `--ms-duration-*` tokens are zeroed under reduced motion, and somebody who
 * asked for no motion still has to be able to READ the thing.
 */
export const EMOTE_LIFETIME_MS = 2600;

/**
 * How long a ping's ring stays. Shorter than a reaction: one that outstays the
 * moment is a ring over a cell somebody is trying to click. A timer, as above.
 */
export const PING_LIFETIME_MS = 2000;

/** What a screen reader hears for a ping. ONE-BASED, the same as `cellAriaLabel`, so the two agree. */
export const pingAnnouncement = (name: string, row: number, col: number): string =>
    `${name} pinged row ${row + 1}, column ${col + 1}`;

/**
 * What a screen reader hears: "Alex: Nice". Null for an emote this build
 * cannot name, the same refusal `emoteArtById` makes for one it cannot draw.
 */
export const emoteAnnouncement = (name: string, emote: string): string | null => {
    const label = emoteLabel(emote);
    return label ? `${name}: ${label}` : null;
};
