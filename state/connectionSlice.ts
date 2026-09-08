import { StateCreator } from 'zustand';
import type { MinesweeperState } from './store';

/**
 * What the socket is doing, as far as the user needs to know. 'unreachable'
 * (never got through) is distinct from 'reconnecting' (was live, dropped)
 * because the user has no game to lose yet. Every error dialog arrives as a
 * SERVER event, so this slice is the one place that can report the server gone.
 */
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'unreachable';

/** Which fire-and-forget room request is awaiting the server's answer. */
export type JoinPending = 'create' | 'join' | null;

export interface ConnectionSlice {
    connectionStatus: ConnectionStatus;
    /**
     * Set when createRoom/joinRoom emit, cleared by whichever reply lands, so
     * a cold dyno reads as "joining…" rather than a swallowed click.
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
