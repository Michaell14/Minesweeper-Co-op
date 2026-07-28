/**
 * Public entry point for the client store.
 *
 * The store itself lives in `state/`, split into slices. This file keeps the
 * long-standing `@/app/store` import path working and re-exports the types that
 * components use.
 */
export { useMinesweeperStore, type MinesweeperState } from '@/state/store';
export type { Cell, PlayerStats, PlayerHover } from '@/state/types';
export type { PvpOpponentStatus } from '@/state/pvpSlice';
