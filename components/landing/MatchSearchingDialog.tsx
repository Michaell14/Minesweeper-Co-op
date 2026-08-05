"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Dialog, DialogClose } from "@/components/ds";
import { DIALOGS } from "@/lib/dialogs";
import { DEFAULT_PRESET } from "@/shared/boardConfig";
import { formatElapsed } from "@/lib/gameClock";
import { practiceTargetFor, PRACTICE_PAR_MS, type PracticeTarget } from "@/lib/practice";

export interface MatchSearchingDialogProps {
    cancelMatch: () => void;
    startPracticeRace: () => void;
}

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
    const seconds = useElapsedSeconds(matchSearching);

    const [target, setTarget] = React.useState<PracticeTarget>({
        ms: PRACTICE_PAR_MS,
        isPersonal: false,
    });

    React.useEffect(() => {
        setTarget(practiceTargetFor(DEFAULT_PRESET.rows, DEFAULT_PRESET.cols, DEFAULT_PRESET.mines));
    }, [matchSearching]);

    return (
        <Dialog
            id={DIALOGS.matchSearching}
            title="Looking for an opponent..."
            onClose={() => {
                if (useMinesweeperStore.getState().matchSearching) cancelMatch();
            }}
            actionsAlign="between"
            actions={
                <>
                    <DialogClose onClick={cancelMatch} aria-label="Cancel the search and return to the menu">
                        Cancel
                    </DialogClose>
                    <Button
                        type="submit"
                        intent="success"
                        onClick={startPracticeRace}
                        aria-label={`Play solo against a target time of ${formatElapsed(target.ms)}`}>
                        Race the clock
                    </Button>
                </>
            }>
            <p className="text-pixel-xs text-ink-muted mb-2">
                You&apos;ll race a random player on a {DEFAULT_PRESET.rows}x{DEFAULT_PRESET.cols} board
                with {DEFAULT_PRESET.mines} mines.
            </p>
            <p className="text-pixel-xs text-ink-muted mb-2">
                No one else is searching right now.{' '}
                {othersOnline > 0
                    ? `${othersOnline} other ${othersOnline === 1 ? 'player is' : 'players are'} online.`
                    : "You're the only one here."}
            </p>
            <p className="text-pixel-xs text-ink-muted mb-4" aria-live="polite">
                Waiting {seconds}s
            </p>
            <p className="text-pixel-xs text-ink-muted mb-4">
                {target.isPersonal
                    ? `Or play now against your best time of ${formatElapsed(target.ms)}.`
                    : `Or play now against a par time of ${formatElapsed(target.ms)}.`}
            </p>
        </Dialog>
    );
}
