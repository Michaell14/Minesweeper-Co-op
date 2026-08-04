"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Dialog, DialogClose } from "@/components/ds";
import { DIALOGS } from "@/lib/dialogs";
import { DEFAULT_PRESET } from "@/shared/boardConfig";
import { formatElapsed } from "@/lib/gameClock";
import { practiceTargetFor, PRACTICE_PAR_MS, type PracticeTarget } from "@/lib/practice";

/**
 * The quick-match wait.
 *
 * Modal on purpose: while queued you must not also be creating or joining a
 * room, and the server refuses to pair a socket that already has a player
 * record — so a landing page that stayed interactive would just be offering a
 * second way to reach a `matchError`.
 *
 * Opened by `findMatch` in hooks/useGameActions.ts and closed by every exit
 * from the search (paired, cancelled, failed, or practice) in
 * hooks/useGameEvents.ts.
 */
export interface MatchSearchingDialogProps {
    /** Leaves the queue. The button also closes the dialog natively. */
    cancelMatch: () => void;
    /** Leaves the queue and opens a solo board racing a target time. */
    startPracticeRace: () => void;
}

/** How long to wait before offering the way out. */
export const PRACTICE_OFFER_AFTER_SECONDS = 20;

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

export default function MatchSearchingDialog({ cancelMatch, startPracticeRace }: MatchSearchingDialogProps) {
    const matchSearching = useMinesweeperStore((state) => state.matchSearching);
    const othersOnline = useMinesweeperStore((state) => state.matchOthersOnline);
    /*
     * A wait with no moving part reads as a hang, and there is nothing honest to
     * animate — the server cannot say how close a pairing is, because that
     * depends on a player who has not arrived. So this counts the one thing it
     * genuinely knows. Plain text, so `prefers-reduced-motion` has nothing to
     * suppress and no `--ms-duration-*` token is involved.
     */
    const seconds = useElapsedSeconds(matchSearching);

    /*
     * Read AFTER mount, never during render.
     *
     * `practiceTargetFor` reads localStorage, which does not exist on the
     * server — so a player who HAS a record rendered the offer while the server
     * had rendered the par branch without it, and React tore the page down and
     * rebuilt it. Invisible to anyone whose records were empty, which is why it
     * survived a browser pass.
     *
     * Starting from the par is what makes the two agree: it is exactly what the
     * server can render. Re-read per SEARCH rather than per render, so a player
     * who practises, clears the board and searches again sees the time they just
     * set without paying a storage read every second the counter ticks.
     */
    const [target, setTarget] = React.useState<PracticeTarget>({
        ms: PRACTICE_PAR_MS,
        isPersonal: false,
    });

    React.useEffect(() => {
        setTarget(practiceTargetFor(DEFAULT_PRESET.rows, DEFAULT_PRESET.cols, DEFAULT_PRESET.mines));
    }, [matchSearching]);

    /*
     * The offer waits, but only for someone who has never played this board.
     * A player with a record here already knows what practice is and has a time
     * to beat, so making them sit through the countdown to be told about it is
     * just a worse version of the same offer.
     */
    const offerPractice = target.isPersonal || seconds >= PRACTICE_OFFER_AFTER_SECONDS;

    return (
        <Dialog
            id={DIALOGS.matchSearching}
            title="Looking for an opponent..."
            actionsAlign={offerPractice ? "between" : "end"}
            actions={
                <>
                    <DialogClose onClick={cancelMatch} aria-label="Cancel the search and return to the menu">
                        Cancel
                    </DialogClose>
                    {offerPractice && (
                        // type="submit" so the dialog closes on the same click.
                        <Button
                            type="submit"
                            intent="success"
                            onClick={startPracticeRace}
                            aria-label={`Play solo against a target time of ${formatElapsed(target.ms)}`}>
                            Race the clock
                        </Button>
                    )}
                </>
            }>
            <p className="text-pixel-xs text-ink-muted mb-2">
                You&apos;ll race a random player on a {DEFAULT_PRESET.rows}x{DEFAULT_PRESET.cols} board
                with {DEFAULT_PRESET.mines} mines.
            </p>
            {/*
              * Stated flatly, because it is knowably true rather than a guess:
              * reaching this dialog MEANS nobody pairable was in the queue, and
              * anyone arriving later pairs immediately instead of queueing
              * alongside. What the player cannot tell is whether anyone is
              * around at all, so that is the number worth showing.
              */}
            <p className="text-pixel-xs text-ink-muted mb-2">
                No one else is searching right now.{' '}
                {othersOnline > 0
                    ? `${othersOnline} other ${othersOnline === 1 ? 'player is' : 'players are'} online.`
                    : "You're the only one here."}
            </p>
            <p className="text-pixel-xs text-ink-muted mb-4" aria-live="polite">
                Waiting {seconds}s
            </p>
            {offerPractice && (
                <p className="text-pixel-xs text-ink-muted mb-4">
                    {target.isPersonal
                        ? `Or play now against your best time of ${formatElapsed(target.ms)}.`
                        : `Or play now against a par time of ${formatElapsed(target.ms)}.`}
                </p>
            )}
        </Dialog>
    );
}
