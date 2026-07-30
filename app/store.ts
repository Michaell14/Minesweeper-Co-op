/**
 * Public entry point for the client store.
 *
 * The store itself lives in `state/`, split into slices. This file keeps the
 * long-standing `@/app/store` import path working and re-exports the one type
 * components name directly (`Cell`, for a cell prop). Everything else is reached
 * through a selector, so its type is inferred and never needs importing —
 * re-export a slice's types here only when a component actually names them.
 */
export { useMinesweeperStore } from '@/state/store';
export type { Cell } from '@/state/types';
