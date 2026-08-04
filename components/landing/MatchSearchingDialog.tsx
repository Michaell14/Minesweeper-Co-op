"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Dialog, DialogClose } from "@/components/ds";
import { DIALOGS } from "@/lib/dialogs";
import { DEFAULT_PRESET } from "@/shared/boardConfig";

/**
 * The quick-match wait.
 *
 * Modal on purpose: while queued you must not also be creating or joining a
 * room, and the server refuses to pair a socket that already has a player
 * record — so a landing page that stayed interactive would just be offering a
 * second way to reach a `matchError`.
 *
 * Opened by `findMatch` in hooks/useGameActions.ts and closed by every exit
 * from the search (paired, cancelled, failed) in hooks/useGameEvents.ts.
 */
export interface MatchSearchingDialogProps {
    /** Leaves the queue. The button also closes the dialog natively. */
    cancelMatch: () => void;
}

/** Counts up for as long as the search is running. */
function useElapsedSeconds(running: boolean): number {
    const [seconds, setSeconds] = React.useState(0);

    React.useEffect(() => {
        if (!running) {
            setSeconds(0);
            return;
        }
        const started = Date.now();
        const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(id);
    }, [running]);

    return seconds;
}

export default function MatchSearchingDialog({ cancelMatch }: MatchSearchingDialogProps) {
    const matchSearching = useMinesweeperStore((state) => state.matchSearching);
    /*
     * A wait with no moving part reads as a hang, and there is nothing honest to
     * animate — the server cannot say how close a pairing is, because that
     * depends on a player who has not arrived. So this counts the one thing it
     * genuinely knows. Plain text, so `prefers-reduced-motion` has nothing to
     * suppress and no `--ms-duration-*` token is involved.
     */
    const seconds = useElapsedSeconds(matchSearching);

    return (
        <Dialog
            id={DIALOGS.matchSearching}
            title="Looking for an opponent..."
            actions={
                <DialogClose onClick={cancelMatch} aria-label="Cancel the search and return to the menu">
                    Cancel
                </DialogClose>
            }>
            <p className="text-pixel-xs text-ink-muted mb-2">
                You&apos;ll race a random player on a {DEFAULT_PRESET.rows}x{DEFAULT_PRESET.cols} board
                with {DEFAULT_PRESET.mines} mines.
            </p>
            <p className="text-pixel-xs text-ink-muted mb-4" aria-live="polite">
                Waiting {seconds}s
            </p>
        </Dialog>
    );
}
