import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, DialogClose, Dialog, Field, Input, NameWithAvatar, Table } from '@/components/ds';
import { DIALOGS, openDialog, closeDialog } from '@/lib/dialogs';
import { buildDailyShareText, percentCleared, shareDailyResult } from '@/lib/dailyShare';
import { dailyWinStreak, readDailyHistory } from '@/lib/dailyHistory';
import { formatElapsed } from '@/lib/gameClock';

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
     * this button does not submit its form, so native validation never runs.
     * Rendered by Field rather than alert()'d -- a browser modal over a <dialog>
     * blocks the thread and ignores the theme.
     */
    const [nameError, setNameError] = React.useState('');

    /*
     * Nothing about an emit is visible, so between the click and the server's
     * answer the button would sit there looking untouched — the same "dead
     * button" the empty-name error above exists to avoid. It says so instead,
     * and refuses a second click while the first is out.
     *
     * The timer is what keeps that from becoming a trap: a submission that
     * never lands (socket down) would otherwise disable the only way to retry
     * it, which is the dead end this dialog was just fixed for. On success
     * `dailyScoreSubmitted` closes the dialog long before it fires.
     */
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const submitTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const stopSubmitting = React.useCallback(() => {
        if (submitTimeout.current) clearTimeout(submitTimeout.current);
        setIsSubmitting(false);
    }, []);

    React.useEffect(() => stopSubmitting, [stopSubmitting]);

    // A resumed attempt reopens this dialog; it must not reopen mid-submit.
    React.useEffect(() => {
        if (dailyStatus !== 'won_pending_submit') stopSubmitting();
    }, [dailyStatus, stopSubmitting]);

    const confirmSubmit = () => {
        if (isSubmitting) return;

        const nameValue = (nameInputRef.current?.value ?? '').trim();
        if (!nameValue) {
            setNameError('Enter a name to go on the leaderboard.');
            return;
        }
        setNameError('');
        setIsSubmitting(true);
        if (submitTimeout.current) clearTimeout(submitTimeout.current);
        submitTimeout.current = setTimeout(() => setIsSubmitting(false), 5000);
        submitDailyScore(nameValue);
    };

    /**
     * Closes the open dialog and opens the leaderboard. A plain Button with a
     * manual close/open, not a DialogClose: its native submit-close and this
     * showModal() would race within the same click.
     */
    const viewLeaderboard = (fromDialog: typeof DIALOGS[keyof typeof DIALOGS]) => () => {
        closeDialog(fromDialog);
        getDailyLeaderboard();
        openDialog(DIALOGS.dailyLeaderboard);
    };

    // One label serves every "Share Result" button: only one daily dialog is
    // ever open at a time.
    const [shareFeedback, setShareFeedback] = React.useState('');
    const shareFeedbackTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleShare = React.useCallback(async () => {
        const won = dailyStatus === 'completed';
        // Read at click time via getState(), not subscribed: the board changes
        // on every opened cell, and these dialogs must not re-render with it.
        // Same reason the streak reads localStorage here rather than in state.
        const { board, dailyMilestones } = useMinesweeperStore.getState();
        const text = buildDailyShareText({
            date: dailyDate,
            status: won ? 'completed' : 'failed',
            elapsedMs: dailyElapsedMs,
            rank: dailyRank,
            totalEntries: dailyTotalEntries,
            streak: won ? dailyWinStreak(readDailyHistory(), dailyDate) : 0,
            progressPercent: won ? null : percentCleared(board),
            milestones: dailyMilestones,
        });

        const outcome = await shareDailyResult(text);
        if (outcome === 'failed') return; // button just stays "Share Result"

        setShareFeedback(outcome === 'shared' ? 'Shared!' : 'Copied!');
        if (shareFeedbackTimeout.current) clearTimeout(shareFeedbackTimeout.current);
        shareFeedbackTimeout.current = setTimeout(() => setShareFeedback(''), 2000);
    }, [dailyDate, dailyStatus, dailyElapsedMs, dailyRank, dailyTotalEntries]);

    // Cancels the pending "reset to Share Result" timer if this unmounts first,
    // as RoomPanel's Copy Link does.
    React.useEffect(() => () => {
        if (shareFeedbackTimeout.current) clearTimeout(shareFeedbackTimeout.current);
    }, []);

    const shareButton = (ariaLabel: string) => (
        <Button onClick={handleShare} aria-label={ariaLabel}>
            {shareFeedback || 'Share Result'}
        </Button>
    );

    return (
        <>
            {/* Announces the Share button's "Copied!"/"Shared!" feedback -- a
                label change on the button itself is not reliably picked up, same
                as RoomPanel's Copy Link. */}
            <span className="sr-only" aria-live="polite">{shareFeedback}</span>

            {/* Won: enter a name to add today's time to the leaderboard. */}
            <Dialog
                id={DIALOGS.dailySubmit}
                title="You solved it!"
                actions={
                    /*
                     * A plain Button, NOT a DialogClose: the server has the last
                     * word on whether a submission lands, and this used to close
                     * on the click regardless. A refusal — the attempt already
                     * submitted from another tab, or the socket down — then left
                     * the player with no dialog, a status still stuck at
                     * won_pending_submit, and no way back to it short of a
                     * reload. `dailyScoreSubmitted` closes it instead, so a
                     * submission that never lands leaves the button there to
                     * press again.
                     */
                    <Button
                        intent="success"
                        onClick={confirmSubmit}
                        disabled={isSubmitting}
                        aria-label="Submit your time to the leaderboard">
                        {isSubmitting ? 'Submitting...' : 'Submit'}
                    </Button>
                }>
                <p className="text-pixel-sm">Your time: <strong>{elapsedLabel}</strong></p>
                {/*
                 * The label is not optional here the way it is on the room's
                 * name dialog: that one's TITLE is "Enter your Name:", so the
                 * lone input is self-explanatory. This dialog's title is "You
                 * solved it!", which leaves an empty box explaining nothing.
                 */}
                <Field
                    className="mt-3 mb-4"
                    label="Enter a name for the leaderboard:"
                    invalid={nameError !== ''}
                    errorText={nameError}>
                    <Input
                        ref={nameInputRef}
                        type="text"
                        name="name"
                        maxLength={16}
                        minLength={1}
                        required
                        placeholder="Your name"
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
                        <div className="flex items-center gap-3">
                            <Button
                                intent="error"
                                onClick={viewLeaderboard(DIALOGS.dailyGameOver)}
                                aria-label="Close dialog and view today's leaderboard">
                                View Leaderboard
                            </Button>
                            <DialogClose aria-label="Close dialog and view your board">
                                Close
                            </DialogClose>
                        </div>
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
                        <div className="flex items-center gap-3">
                            <Button
                                onClick={viewLeaderboard(DIALOGS.dailyAlreadyPlayed)}
                                aria-label="Close dialog and view today's leaderboard">
                                View Leaderboard
                            </Button>
                            <DialogClose aria-label="Close dialog and view your board">
                                Close
                            </DialogClose>
                        </div>
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
                        {/* Only a submitted run has a personal result to share. */}
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
                                        <td className="text-pixel-md">
                                            <NameWithAvatar avatar={entry.avatar}>{entry.name}</NameWithAvatar>
                                        </td>
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
