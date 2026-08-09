import { StateCreator } from 'zustand';
import type { MinesweeperState } from './store';

/**
 * What the socket is doing, as far as the user needs to know.
 *
 * - 'connecting'   — first dial, nothing to report yet.
 * - 'connected'    — live.
 * - 'reconnecting' — was live, dropped; socket.io is redialling on its own.
 * - 'unreachable'  — never got through at all (server down or cold). Distinct
 *   from 'reconnecting' because the user has no game to lose yet — the message
 *   is "can't reach the server", not "hold on".
 *
 * Every error dialog in the app arrives as a SERVER event, so none of them can
 * report the server being gone. This slice is the one place that can.
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'unreachable';

/** Which fire-and-forget room request is awaiting the server's answer. */
export type JoinPending = 'create' | 'join' | null;

export interface ConnectionSlice {
    connectionStatus: ConnectionStatus;
    /**
     * Set when createRoom/joinRoom emit, cleared by whichever reply lands
     * (success or any of the error dialogs). Landing shows it so a slow server
     * — a cold Heroku dyno — reads as "joining…" rather than a swallowed click.
     */
    joinPending: JoinPending;

    setConnectionStatus: (status: ConnectionStatus) => void;
    setJoinPending: (pending: JoinPending) => void;
}

export const createConnectionSlice: StateCreator<MinesweeperState, [], [], ConnectionSlice> = (set) => ({
    connectionStatus: 'connecting',
    joinPending: null,

    setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
    setJoinPending: (joinPending) => set({ joinPending }),
});
