/**
 * The client store, assembled from slices — game, board config, room, PVP,
 * input, daily, best times. Slices are plain creators, so one can still write another's
 * fields where it genuinely needs to (resetPvpState clears gameOver/gameWon).
 *
 * Consumers import from `@/app/store`, which re-exports this. Always subscribe
 * with a selector (`useMinesweeperStore((s) => s.board)`) rather than calling
 * the hook bare, or the component re-renders on every unrelated write —
 * including remote hover events, which fire constantly.
 */
import { create } from 'zustand';
import { createGameSlice, type GameSlice } from './gameSlice';
import { createBoardConfigSlice, type BoardConfigSlice } from './boardConfigSlice';
import { createRoomSlice, type RoomSlice } from './roomSlice';
import { createPvpSlice, type PvpSlice } from './pvpSlice';
import { createInputSlice, type InputSlice } from './inputSlice';
import { createDailySlice, type DailySlice } from './dailySlice';
import { createSettingsSlice, type SettingsSlice } from './settingsSlice';
import { createAchievementsSlice, type AchievementsSlice } from './achievementsSlice';
import { createBestsSlice, type BestsSlice } from './bestsSlice';
import { createConnectionSlice, type ConnectionSlice } from './connectionSlice';

export type MinesweeperState =
    GameSlice &
    BoardConfigSlice &
    RoomSlice &
    PvpSlice &
    InputSlice &
    DailySlice &
    SettingsSlice &
    AchievementsSlice &
    BestsSlice &
    ConnectionSlice;

export const useMinesweeperStore = create<MinesweeperState>()((...a) => ({
    ...createGameSlice(...a),
    ...createBoardConfigSlice(...a),
    ...createRoomSlice(...a),
    ...createPvpSlice(...a),
    ...createInputSlice(...a),
    ...createDailySlice(...a),
    ...createSettingsSlice(...a),
    ...createAchievementsSlice(...a),
    ...createBestsSlice(...a),
    ...createConnectionSlice(...a),
}));
