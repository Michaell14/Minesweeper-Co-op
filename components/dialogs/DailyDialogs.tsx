import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, DialogClose, Dialog, Field, Input, Table } from '@/components/ds';
import { DIALOGS, openDialog, closeDialog } from '@/lib/dialogs';
import { buildDailyShareText, shareDailyResult, formatElapsed } from '@/lib/dailyShare';

interface DailyDialogsParams {
    submitDailyScore: (name: string) => void;
    getDailyLeaderboard: () => void;
}

/**
 * The daily challenge's dialogs, opened imperatively by hooks/useGameEvents.ts
 * and components/DailyChallenge.tsx via openDialog(DIALOGS.x) -- this only
 * renders the markup, following components/dialogs/GameDialogs.tsx's precedent.
 */
export default function DailyDialogs({ submitDailyScore, getDailyLeaderboard }: DailyDialogsParams) {
    const dailyDate = useMinesweeperStore((state) => state.dailyDate);
    const dailyElapsedMs = useMinesweeperStore((state) => state.dailyElapsedMs);
    const dailyRank = useMinesweeperStore((state) => state.dailyRank);
    const dailyTotalEntries = useMinesweeperStore((state) => state.dailyTotalEntries);
    const dailyStatus = useMinesweeperStore((state) => state.dailyStatus);
    const dailyLeaderboard = useMinesweeperStore((state) => state.dailyLeaderboard);

    const elapsedLabel = dailyElapsedMs !== null ? formatElapsed(dailyElapsedMs) : '--:--';

    const nameInputRef = React.useRef<HTMLInputElement>(null);

    /*
     * `required` alone does not cover this: a name of spaces satisfies it, and
     * preventing the default on this click means native validation never runs
     * anyway. The message is rendered by Field rather than alert()'d -- a
     * browser modal on top of a <dialog> blocks the thread, ignores the theme,
     * and is the one piece of UI here nothing in components/ds can style.
     */
    const [nameError, setNameError] = React.useState('');

    const confirmSubmit = (e: React.MouseEvent) => {
        const nameValue = (nameInputRef.current?.value ?? '').trim();
        if (!nameValue) {
            e.preventDefault();
            setNameError('Enter a name to go on the leaderboard.');
            return;
        }
        setNameError('');
        submitDailyScore(nameValue);
    };

    /**
     * Closes the currently-open dialog and opens the leaderboard instead --
     * a plain (non-submit) Button + manual close/open rather than letting a
     * DialogClose's native submit-close handle it, since that closure and
     * this dialog's showModal() would otherwise race within the same click.
     */
    const viewLeaderboard = (fromDialog: typeof DIALOGS[keyof typeof DIALOGS]) => () => {
        closeDialog(fromDialog);
        getDailyLeaderboard();
        openDialog(DIALOGS.dailyLeaderboard);
    };

    // Shared by every "Share Result" button below -- there's only ever one
    // daily dialog open at a time, so one feedback label is enough.
    const [shareFeedback, setShareFeedback] = React.useState('');
    const shareFeedbackTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleShare = React.useCallback(async () => {
        const text = buildDailyShareText({
            date: dailyDate,
            status: dailyStatus === 'completed' ? 'completed' : 'failed',
            elapsedMs: dailyElapsedMs,
            rank: dailyRank,
            totalEntries: dailyTotalEntries,
        });

        const outcome = await shareDailyResult(text);
        if (outcome === 'failed') return; // button just stays "Share Result"

        setShareFeedback(outcome === 'shared' ? 'Shared!' : 'Copied!');
        if (shareFeedbackTimeout.current) clearTimeout(shareFeedbackTimeout.current);
        shareFeedbackTimeout.current = setTimeout(() => setShareFeedback(''), 2000);
    }, [dailyDate, dailyStatus, dailyElapsedMs, dailyRank, dailyTotalEntries]);

    const shareButton = (ariaLabel: string) => (
        <Button onClick={handleShare} aria-label={ariaLabel}>
            {shareFeedback || 'Share Result'}
        </Button>
    );

    return (
        <>
            {/* Announces the Share button's "Copied!"/"Shared!" feedback --
              * its own label change isn't reliably picked up by a screen
              * reader, same reasoning as RoomPanel's Copy Link button. */}
            <span className="sr-only" aria-live="polite">{shareFeedback}</span>

            {/* Won: enter a name to add today's time to the leaderboard. */}
            <Dialog
                id={DIALOGS.dailySubmit}
                title="You solved it!"
                actions={
                    <DialogClose intent="success" onClick={confirmSubmit} aria-label="Submit your time to the leaderboard">
                        Submit
                    </DialogClose>
                }>
                <p className="text-pixel-sm">Your time: <strong>{elapsedLabel}</strong></p>
                <Field className="mb-4" invalid={nameError !== ''} errorText={nameError}>
                    <Input
                        ref={nameInputRef}
                        type="text"
                        name="name"
                        maxLength={16}
                        minLength={1}
                        required
                        invalid={nameError !== ''}
                        aria-label="Your name for the leaderboard"
                        aria-required="true" />
                </Field>
            </Dialog>

            {/* Hit a mine: no retry today. */}
            <Dialog
                id={DIALOGS.dailyGameOver}
                title="Boom!"
                alert
                actionsAlign="between"
                actions={
                    <>
                        {shareButton("Share your daily challenge result")}
                        <Button
                            intent="error"
                            onClick={viewLeaderboard(DIALOGS.dailyGameOver)}
                            aria-label="Close dialog and view today's leaderboard">
                            View Leaderboard
                        </Button>
                    </>
                }>
                <p className="text-pixel-sm">You hit a mine at <strong>{elapsedLabel}</strong>. Come back tomorrow for a new puzzle!</p>
            </Dialog>

            {/* Resumed after a refresh: attempt was already terminal (failed or completed). */}
            <Dialog
                id={DIALOGS.dailyAlreadyPlayed}
                title="Already played today!"
                alert
                actionsAlign="between"
                actions={
                    <>
                        {shareButton("Share your daily challenge result")}
                        <Button
                            onClick={viewLeaderboard(DIALOGS.dailyAlreadyPlayed)}
                            aria-label="Close dialog and view today's leaderboard">
                            View Leaderboard
                        </Button>
                    </>
                }>
                {dailyStatus === 'completed' ? (
                    <p className="text-pixel-sm">
                        Your time: <strong>{elapsedLabel}</strong>
                        {dailyRank ? <> — rank <strong>#{dailyRank}</strong></> : null}
                    </p>
                ) : (
                    <p className="text-pixel-sm">You hit a mine at <strong>{elapsedLabel}</strong>.</p>
                )}
                <p className="text-pixel-sm">Come back tomorrow for a new puzzle.</p>
            </Dialog>

            {/* Today's leaderboard, fastest first. */}
            <Dialog
                id={DIALOGS.dailyLeaderboard}
                title="Today's Leaderboard"
                actionsAlign={dailyStatus === 'completed' ? 'between' : 'end'}
                actions={
                    <>
                        {/* Only a submitted (completed) run has a personal
                          * result worth sharing -- someone just browsing the
                          * leaderboard mid-game, or a fresh visitor, does not. */}
                        {dailyStatus === 'completed' && shareButton("Share your daily challenge result")}
                        <DialogClose aria-label="Close leaderboard dialog">Close</DialogClose>
                    </>
                }>
                {dailyLeaderboard.length === 0 ? (
                    <p className="text-pixel-xs">No times submitted yet today — could be you!</p>
                ) : (
                    <div className="overflow-x-auto">
                        <Table aria-label="Today's leaderboard showing rank, name, and time">
                            <thead>
                                <tr>
                                    <th scope="col">Rank</th>
                                    <th scope="col">Name</th>
                                    <th scope="col">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dailyLeaderboard.map((entry) => (
                                    <tr key={entry.rank}>
                                        <td className="text-pixel-md">{entry.rank}</td>
                                        <td className="text-pixel-md">{entry.name}</td>
                                        <td className="text-pixel-md">{formatElapsed(entry.elapsedMs)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </div>
                )}
            </Dialog>
        </>
    );
}
