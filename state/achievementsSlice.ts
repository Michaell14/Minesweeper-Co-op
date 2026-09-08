import type { StateCreator } from 'zustand';

/**
 * Achievements unlocked this session, waiting to be announced. A QUEUE, since
 * one result can unlock several at once. Ids only; the catalog is already on
 * the client.
 */
export interface AchievementsSlice {
    unlockedQueue: string[];
    pushUnlocked: (ids: string[]) => void;
    dismissUnlocked: (id: string) => void;
}

export const createAchievementsSlice: StateCreator<AchievementsSlice> = (set) => ({
    unlockedQueue: [],

    // Deduped: two results landing together can each carry the same id.
    pushUnlocked: (ids) =>
        set((state) => ({
            unlockedQueue: [...state.unlockedQueue, ...ids.filter((id) => !state.unlockedQueue.includes(id))],
        })),

    dismissUnlocked: (id) =>
        set((state) => ({ unlockedQueue: state.unlockedQueue.filter((queued) => queued !== id) })),
});
