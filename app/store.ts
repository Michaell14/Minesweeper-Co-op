/**
 * Public entry point for the client store, which lives in `state/` as slices.
 * Keeps the `@/app/store` path working and re-exports `Cell`, the one type
 * components name directly; re-export others only when a component needs them.
 */
export { useMinesweeperStore } from '@/state/store';
export type { Cell } from '@/state/types';
