"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useMinesweeperStore } from "@/app/store";
import { Button, CalendarIcon } from "@/components/ds";
import ConnectionBanner from "@/components/ConnectionBanner";
import DailyChallenge from "@/components/DailyChallenge";
import DailyDialogs from "@/components/dialogs/DailyDialogs";
import { useGameSession } from "@/hooks/useGameSession";
import { hasSeenDailyExplainer } from "@/lib/dailyExplainerSeen";
import { DIALOGS, openDialog } from "@/lib/dialogs";

/**
 * Wait for an automatic start before handing the page back. Generous: the
 * first request of the day generates the board, which may take many attempts.
 */
const AUTO_START_TIMEOUT_MS = 15_000;

/**
 * The interactive half of /daily.
 *
 * The attempt starts on MOUNT. Starting consumes the day's one attempt, but a
 * fresh attempt is stored with `startedAt: null` and resumes under the same
 * browser token (server/controllers/dailyController.js), so arriving without
 * playing costs nothing. The prose still renders below the board, server-side,
 * so /daily keeps its indexable text; the rules are a dialog shown once per browser.
 *
 * Leaving navigates: `leaveDaily` alone lands back on this page, but the state
 * still has to be cleared (a stale clock gets recorded as a run).
 */
export default function DailyClient({ intro }: { intro: React.ReactNode }) {
    const { socket, actions } = useGameSession();
    const router = useRouter();

    /*
     * `dailyStatus` tracks the BOARD: 'idle' until the server answers. `dailyActive`
     * means "the daily view is showing", and on this route the intro is that too.
     */
    const dailyStatus = useMinesweeperStore((state) => state.dailyStatus);
    const attemptLoaded = dailyStatus !== "idle";

    /*
     * A board that can still be played, as opposed to one being read back.
     *
     * A terminal resume loads through the same field: `DAILY_ALREADY_ATTEMPTED`
     * opens the submit or already-played dialog itself, so the explainer below
     * has to sit those out or it lands modally on top of the result the player
     * came back for.
     */
    const attemptPlayable = dailyStatus === "ready" || dailyStatus === "in_progress";

    const { leaveDaily: clearDailyState, leaveRoom, cancelMatch, startDaily } = actions;

    /*
     * Being on this route IS the daily view, board or no board.
     * hooks/useGameEvents.ts reads `dailyActive` to refuse a SESSION_RESUME
     * offer; gated on the board, the intro sat outside that guard and a resume
     * was accepted behind it. Set before the socket exists (no deps here, the
     * effect below waits on `socket`) so the flag is up before any offer.
     */
    React.useEffect(() => {
        useMinesweeperStore.getState().setDailyActive(true);
        // Full leave rather than `resetDailyState` so the run clock goes too;
        // left standing, the next room's win records it as a time played here.
        return clearDailyState;
    }, [clearDailyState]);

    /*
     * Choosing the daily leaves the room rather than holding both: the views
     * share gameSlice's board, and a player left behind is still on the roster
     * and scoring. PLAYER_LEAVE calls `forgetRoom` server-side, the one exit
     * never resumed (server/controllers/sessionController.js). Waits on the
     * socket because both emits need one.
     */
    React.useEffect(() => {
        if (!socket) return;
        const { playerJoined, matchSearching } = useMinesweeperStore.getState();
        if (playerJoined) leaveRoom();
        else if (matchSearching) cancelMatch();
    }, [socket, leaveRoom, cancelMatch]);

    /*
     * `autoStarting` is separate from the pending ref because it also suppresses
     * the intro for the socket round trip; one frame survives regardless, since
     * the route is statically rendered.
     */
    const [autoStarting, setAutoStarting] = React.useState(false);

    /*
     * `startDaily` is a silent no-op until `useSocket`'s effect has run, so the
     * start is held and fires when the socket lands. Also covers the retry
     * button below, which is live from hydration.
     */
    const startPending = React.useRef(false);

    const requestStart = React.useCallback(() => {
        // Raised here rather than beside the mount call, so a press of the
        // retry button gets the loading line and a fresh timeout as well —
        // otherwise the second attempt at a server that is still down looks
        // like a button that does nothing at all.
        setAutoStarting(true);
        if (!socket) {
            startPending.current = true;
            return;
        }
        startDaily();
    }, [socket, startDaily]);

    React.useEffect(() => {
        if (!socket || !startPending.current) return;
        startPending.current = false;
        // Through `requestStart` rather than straight to `startDaily`: a socket
        // that lands after the timeout has already handed the page back would
        // otherwise fire a request with no loading line and no timeout of its
        // own to fall back from.
        requestStart();
    }, [socket, requestStart]);

    const autoStarted = React.useRef(false);

    React.useEffect(() => {
        if (autoStarted.current) return;
        autoStarted.current = true;
        requestStart();
    }, [requestStart]);

    /*
     * Give the page back if the answer never comes: `startDaily`'s handler emits
     * nothing on failure, so a dropped socket would leave a loading line with no
     * board or button. Falling back to the intro IS the retry, and pressing it
     * re-arms this timer through `requestStart`.
     */
    React.useEffect(() => {
        if (!autoStarting || attemptLoaded) return;
        const timer = setTimeout(() => setAutoStarting(false), AUTO_START_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [autoStarting, attemptLoaded]);

    /*
     * The rules, once per browser, over the board that is already there.
     *
     * Held open until a PLAYABLE board exists rather than fired on mount: the
     * dialog explains a puzzle, and opening it over a loading line explains one
     * the player cannot yet see — or, on a terminal resume, covers the result
     * dialog that handler just opened. Marking it seen belongs to `onClose`
     * (components/dialogs/DailyDialogs.tsx) rather than here — Escape dismisses
     * it too, and a flag written on open would burn the one showing on a player
     * who reloaded before reading it.
     */
    const explainerShown = React.useRef(false);

    React.useEffect(() => {
        if (!attemptPlayable || explainerShown.current) return;
        explainerShown.current = true;
        if (!hasSeenDailyExplainer()) openDialog(DIALOGS.dailyIntro);
    }, [attemptPlayable]);

    const leaveDaily = React.useCallback(() => {
        clearDailyState();
        router.push("/");
    }, [clearDailyState, router]);

    return (
        <>
            <ConnectionBanner />
            {attemptLoaded ? (
                <>
                    <DailyChallenge
                        leaveDaily={leaveDaily}
                        dailyOpenCell={actions.dailyOpenCell}
                        dailyChordCell={actions.dailyChordCell}
                        dailyToggleFlag={actions.dailyToggleFlag}
                        getDailyLeaderboard={actions.getDailyLeaderboard}
                    />
                    {/* Below the board, and below the fold: the board's own
                        container is min-h-[94vh]. Here for crawlers and for
                        anyone who scrolls, not in the player's way. */}
                    {intro}
                </>
            ) : autoStarting ? (
                <p
                    role="status"
                    className="mx-auto w-full max-w-2xl px-4 py-16 text-center text-pixel-md text-ink-muted">
                    Loading today&apos;s board…
                </p>
            ) : (
                <>
                    {intro}
                    <div className="mx-auto w-full max-w-2xl px-4 pb-12">
                        <Button
                            intent="primary"
                            onClick={requestStart}
                            aria-label="Play today's daily challenge — same board for everyone, ranked by time, one attempt">
                            <span className="flex items-center gap-2">
                                <CalendarIcon size={16} />
                                Play Today&apos;s Puzzle
                            </span>
                        </Button>
                    </div>
                </>
            )}

            <DailyDialogs
                submitDailyScore={actions.submitDailyScore}
                getDailyLeaderboard={actions.getDailyLeaderboard}
            />
        </>
    );
}
