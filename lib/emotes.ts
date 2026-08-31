/**
 * Timing and wording for the reaction feed. Pure — no React, no DOM — so the
 * handler, the component and the tests all read the same numbers.
 *
 * The catalog itself (ids and labels) is `shared/emotes.js`, because the server
 * validates against it.
 */
import { emoteLabel } from "@/shared/emotes";

/**
 * How long a reaction stays on screen.
 *
 * A TIMER, not an animation. The float and fade are CSS on top of this and are
 * zeroed by the `--ms-duration-*` media query under `prefers-reduced-motion` —
 * but somebody who asked for no motion still has to be able to READ the thing,
 * so its lifetime must not be one of the values that query neutralises.
 */
export const EMOTE_LIFETIME_MS = 2600;

/**
 * How long a ping's ring stays on the board.
 *
 * Shorter than a reaction on purpose: a ping means "look HERE, now", and one
 * that outstays the moment is a ring over a cell somebody is trying to click.
 * A timer for the same reason as the reaction's — see above.
 */
export const PING_LIFETIME_MS = 2000;

/**
 * What a screen reader hears for a ping. Rows and columns are announced
 * ONE-BASED, the same as `cellAriaLabel`, so the two agree about which cell is
 * which — the whole point of a ping is that both players mean the same square.
 */
export const pingAnnouncement = (name: string, row: number, col: number): string =>
    `${name} pinged row ${row + 1}, column ${col + 1}`;

/**
 * What a screen reader hears — "Alex: Nice", the shape of a thing said rather
 * than a description of a picture.
 *
 * Returns null for an emote id this build cannot name, which is the same
 * refusal `emoteArtById` makes for one it cannot draw: better silence than
 * announcing the wrong words in somebody else's name.
 */
export const emoteAnnouncement = (name: string, emote: string): string | null => {
    const label = emoteLabel(emote);
    return label ? `${name}: ${label}` : null;
};
