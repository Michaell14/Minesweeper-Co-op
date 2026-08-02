/**
 * The client store, assembled from slices — game, board config, room, PVP,
 * input, daily. Slices are plain creators, so one can still write another's
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

export type MinesweeperState =
    GameSlice &
    BoardConfigSlice &
    RoomSlice &
    PvpSlice &
    InputSlice &
    DailySlice;

export const useMinesweeperStore = create<MinesweeperState>()((...a) => ({
    ...createGameSlice(...a),
    ...createBoardConfigSlice(...a),
    ...createRoomSlice(...a),
    ...createPvpSlice(...a),
    ...createInputSlice(...a),
    ...createDailySlice(...a),
}));
