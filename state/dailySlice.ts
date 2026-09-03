import { StateCreator } from 'zustand';
import type { DailyLeaderboardEntry, DailyAttemptStatus } from '@/shared/socketPayloads';
import type { LossDiagnosis } from '@/lib/lossDiagnosis';
import type { MinesweeperState } from './store';

/** 'idle' = no daily view. The rest mirror the server's attempt status, never a client-invented name. */
export type DailyStatus = DailyAttemptStatus | 'idle' | 'ready' | 'in_progress';

/** Daily view state. The board stays in gameSlice: daily and room views are mutually exclusive. */
export interface DailySlice {
    dailyActive: boolean;              // True while the daily view is showing, instead of Landing/Grid
    dailyDate: string;                 // Server-issued date this attempt belongs to
    dailyStatus: DailyStatus;
    dailyElapsedMs: number | null;     // Set once the attempt reaches a terminal state
    dailyTotalSafeCells: number;
    dailyRank: number | null;
    /** Leaderboard size at this rank; only the share text uses it, so null when unknown. */
    dailyTotalEntries: number | null;
    /** Server-stamped pace milestones for the share bar; null until a terminal event delivers them. */
    dailyMilestones: number[] | null;
    dailyLeaderboard: DailyLeaderboardEntry[];
    /** What the losing move missed. Null until a run ends on a mine. */
    dailyDiagnosis: LossDiagnosis | null;

    setDailyActive: (active: boolean) => void;
    setDailyDate: (date: string) => void;
    setDailyStatus: (status: DailyStatus) => void;
    setDailyElapsedMs: (elapsedMs: number | null) => void;
    setDailyTotalSafeCells: (total: number) => void;
    setDailyRank: (rank: number | null) => void;
    setDailyTotalEntries: (total: number | null) => void;
    setDailyMilestones: (milestones: number[] | null) => void;
    setDailyLeaderboard: (entries: DailyLeaderboardEntry[]) => void;
    setDailyDiagnosis: (diagnosis: LossDiagnosis | null) => void;
    resetDailyState: () => void;
}

const initialDailyState = {
    dailyActive: false,
    dailyDate: '',
    dailyStatus: 'idle' as DailyStatus,
    dailyElapsedMs: null,
    dailyTotalSafeCells: 0,
    dailyRank: null,
    dailyTotalEntries: null,
    dailyMilestones: null,
    dailyLeaderboard: [],
    dailyDiagnosis: null,
};

export const createDailySlice: StateCreator<MinesweeperState, [], [], DailySlice> = (set) => ({
    ...initialDailyState,

    setDailyActive: (active) => set({ dailyActive: active }),
    setDailyDate: (date) => set({ dailyDate: date }),
    setDailyStatus: (status) => set({ dailyStatus: status }),
    setDailyElapsedMs: (elapsedMs) => set({ dailyElapsedMs: elapsedMs }),
    setDailyTotalSafeCells: (total) => set({ dailyTotalSafeCells: total }),
    setDailyRank: (rank) => set({ dailyRank: rank }),
    setDailyTotalEntries: (total) => set({ dailyTotalEntries: total }),
    setDailyMilestones: (milestones) => set({ dailyMilestones: milestones }),
    setDailyLeaderboard: (entries) => set({ dailyLeaderboard: entries }),
    setDailyDiagnosis: (diagnosis) => set({ dailyDiagnosis: diagnosis }),

    /** Leaving the daily view (entering a room, or returning to Landing). */
    resetDailyState: () => set({ ...initialDailyState }),
});
