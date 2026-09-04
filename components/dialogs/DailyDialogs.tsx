import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, ButtonLink, DialogClose, Dialog, Field, Input, NameWithAvatar, Table } from '@/components/ds';
import { DIALOGS, openDialog, closeDialog } from '@/lib/dialogs';
import { buildDailyShareText, percentCleared, shareDailyResult } from '@/lib/dailyShare';
import { dailyWinStreak, readDailyHistory } from '@/lib/dailyHistory';
import { markDailyExplainerSeen } from '@/lib/dailyExplainerSeen';
import { formatElapsed } from '@/lib/gameClock';
import { shortLessonName } from '@/lib/lossDiagnosis';

interface DailyDialogsParams {
    submitDailyScore: (name: string) => void;
    getDailyLeaderboard: () => void;
}

/**
 * The daily challenge's dialogs, opened imperatively via openDialog(DIALOGS.x)
 * by hooks/useGameEvents.ts and components/DailyChallenge.tsx; this only renders markup.
 */
export default function DailyDialogs({ submitDailyScore, getDailyLeaderboard }: DailyDialogsParams) {
    const dailyDate = useMinesweeperStore((state) => state.dailyDate);
    const dailyElapsedMs = useMinesweeperStore((state) => state.dailyElapsedMs);
    const dailyRank = useMinesweeperStore((state) => state.dailyRank);
    const dailyTotalEntries = useMinesweeperStore((state) => state.dailyTotalEntries);
    const dailyStatus = useMinesweeperStore((state) => state.dailyStatus);
    const dailyLeaderboard = useMinesweeperStore((state) => state.dailyLeaderboard);
    const dailyDiagnosis = useMinesweeperStore((state) => state.dailyDiagnosis);

    const elapsedLabel = dailyElapsedMs !== null ? formatElapsed(dailyElapsedMs) : '--:--';

    const nameInputRef = React.useRef<HTMLInputElement>(null);

    /*
     * `required` alone passes a name of spaces, and this button does not submit
     * its form, so native validation never runs. Rendered by Field, not alert()'d.
     */
    const [nameError, setNameError] = React.useState('');

    /*
     * An emit shows nothing, so the button says "Submitting..." and refuses a
     * second click. The timer keeps that from becoming a trap: a submission that
     * never lands (socket down) would otherwise disable the only way to retry.
     * On success `dailyScoreSubmitted` closes the dialog long before it fires.
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
     * Closes the open dialog and opens the leaderboard. A plain Button, not a
     * DialogClose: its native submit-close and this showModal() would race.
     */
    const viewLeaderboard = (fromDialog: typeof DIALOGS[keyof typeof DIALOGS]) => () => {
        closeDialog(fromDialog);
        getDailyLeaderboard();
        openDialog(DIALOGS.dailyLeaderboard);
    };

    // One label serves every "Share Result" button: only one daily dialog is open at a time.
    const [shareFeedback, setShareFeedback] = React.useState('');
    const shareFeedbackTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleShare = React.useCallback(async () => {
        const won = dailyStatus === 'completed';
        // Read at click time, not subscribed: the board changes on every opened
        // cell and these dialogs must not re-render with it. Same for the streak.
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

    // Cancels the pending feedback-reset timer if this unmounts first.
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
            {/* Announces the Share button's feedback; a label change on the button is not reliably read. */}
            <span className="sr-only" aria-live="polite">{shareFeedback}</span>

            {/*
                First visit only: /daily opens straight onto the board, so this
                is the only thing that says what the rules are. Opened by
                app/daily/DailyClient.tsx, which owns the once-ever flag; the
                clock has not started while it is up, so reading it is free.
            */}
            <Dialog
                id={DIALOGS.dailyIntro}
                title="Today's Puzzle"
                onClose={markDailyExplainerSeen}
                actionsAlign="between"
                actions={
                    <>
                        <ButtonLink href="/how-to-play" size="sm">
                            How to play
                        </ButtonLink>
                        {/*
                            Marks seen on the CLICK as well as on onClose. The
                            two cover different dismissals and neither covers
                            both: `close` does not fire in every engine (it does
                            not in Claude Code's embedded Chrome at all), and a
                            click handler never sees Escape. Idempotent, as
                            Dialog's onClose contract requires.
                        */}
                        <DialogClose
                            intent="primary"
                            onClick={markDailyExplainerSeen}
                            aria-label="Close the rules and play today's puzzle">
                            Got it
                        </DialogClose>
                    </>
                }>
                <ul className="text-pixel-sm flex flex-col gap-2">
                    <li>Everyone in the world plays the same board today.</li>
                    <li>One attempt — hit a mine and the run is over.</li>
                    <li>The clock starts on your first click, not now.</li>
                    <li>Clear it and your time goes on today&apos;s leaderboard.</li>
                </ul>
            </Dialog>

            {/* Won: enter a name to add today's time to the leaderboard. */}
            <Dialog
                id={DIALOGS.dailySubmit}
                title="You solved it!"
                actions={
                    /*
                     * A plain Button, NOT a DialogClose: the server has the last
                     * word on whether a submission lands. Closing on click left a
                     * refused player with no dialog and a status stuck at
                     * won_pending_submit; `dailyScoreSubmitted` closes it instead.
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
                 * Not optional as on the room's name dialog, whose TITLE is
                 * "Enter your Name:"; this title leaves an empty box explaining nothing.
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
                {dailyDiagnosis && (
                    <div className="mt-4 flex flex-col items-start gap-2">
                        <p className="text-pixel-sm">
                            {dailyDiagnosis.kind === 'provable-mine' ? (
                                <>You missed <strong>{shortLessonName(dailyDiagnosis.lesson)}</strong>.</>
                            ) : (
                                <>Nothing proved that cell — but <strong>{shortLessonName(dailyDiagnosis.lesson)}</strong> was there.</>
                            )}
                        </p>
                        <p className="text-pixel-xs text-ink-muted">{dailyDiagnosis.text}</p>
                        <ButtonLink href={`/drills/${dailyDiagnosis.lesson}`} size="sm">
                            Drill {shortLessonName(dailyDiagnosis.lesson)}
                        </ButtonLink>
                    </div>
                )}
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
