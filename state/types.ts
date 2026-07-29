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
