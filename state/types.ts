/** Shared value types for the client store. */

/** Cell and PlayerStats arrive over the socket, so the protocol owns them; see shared/socketPayloads.ts. */
export type { Cell, PlayerStats } from '@/shared/socketPayloads';

/** Which cell another player is hovering, and the colour derived from their id. */
export interface PlayerHover {
    row: number;
    col: number;
    name: string;
    color: string;
}

/**
 * A reaction somebody just sent, as the feed holds it. `key` rather than the
 * sender's id, because the same player emoting twice is two entries React
 * must tell apart. `expiresAt` is a wall-clock deadline, so a backgrounded tab
 * that misses its timer catches up on the next tick.
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
 * A cell somebody pointed at. Shaped like PlayerEmote but it names a PLACE,
 * so it is drawn on the board, and the server refuses it in PVP.
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
