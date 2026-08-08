import type { StateCreator } from 'zustand';

/**
 * Achievements unlocked during this session, waiting to be announced.
 *
 * A QUEUE rather than a single current value: one result can unlock several at
 * once (a clear that is both your tenth win and your first Extreme board), and
 * a single slot would show one and silently drop the rest.
 *
 * Ids only. The catalog is already on the client, and storing names here would
 * put a second copy of the copy in the store.
 */
export interface AchievementsSlice {
    unlockedQueue: string[];
    pushUnlocked: (ids: string[]) => void;
    dismissUnlocked: (id: string) => void;
}

export const createAchievementsSlice: StateCreator<AchievementsSlice> = (set) => ({
    unlockedQueue: [],

    // Deduped against what is already queued: the server only sends genuinely
    // new ids, but two results landing together (a co-op win recording while a
    // daily attempt finishes) can each carry one, and a repeat would render as
    // two identical toasts.
    pushUnlocked: (ids) =>
        set((state) => ({
            unlockedQueue: [...state.unlockedQueue, ...ids.filter((id) => !state.unlockedQueue.includes(id))],
        })),

    dismissUnlocked: (id) =>
        set((state) => ({ unlockedQueue: state.unlockedQueue.filter((queued) => queued !== id) })),
});
