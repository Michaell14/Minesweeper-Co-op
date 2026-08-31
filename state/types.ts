/** Shared value types for the client store. */

/**
 * Cell and PlayerStats arrive over the socket, so the protocol owns them and
 * the store re-exports them. Declaring them again here would let the store and
 * the wire drift apart silently. See shared/socketPayloads.ts.
 */
export type { Cell, PlayerStats } from '@/shared/socketPayloads';

/** Which cell another player is hovering, and the colour derived from their id. */
export interface PlayerHover {
    row: number;
    col: number;
    name: string;
    color: string;
}

/**
 * A reaction somebody in the room just sent, as the feed holds it.
 *
 * `key` rather than the sender's socket id, because the same player emoting
 * twice in a row is two entries in the feed rather than one that jumps — and
 * React needs to tell them apart. `expiresAt` is a wall-clock deadline, not a
 * duration: the feed is trimmed by comparing against now, so a backgrounded tab
 * that misses its timer catches up on the next tick instead of piling up.
 */
export interface PlayerEmote {
    key: string;
    /** Sender's socket id — what the colour and "was that me" are derived from. */
    id: string;
    name: string;
    /** A catalog id from shared/emotes.js. */
    emote: string;
    expiresAt: number;
}

/**
 * A cell somebody pointed at. Shaped like PlayerEmote and expiring the same
 * way, but it is not a reaction: it names a PLACE, which is why it is drawn on
 * the board rather than in the feed and why the server refuses it in PVP.
 */
export interface PlayerPing {
    key: string;
    /** Sender's socket id — the ring takes the same colour as their cursor. */
    id: string;
    name: string;
    row: number;
    col: number;
    expiresAt: number;
}
