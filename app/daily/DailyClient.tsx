"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useMinesweeperStore } from "@/app/store";
import { Button, CalendarIcon } from "@/components/ds";
import ConnectionBanner from "@/components/ConnectionBanner";
import DailyChallenge from "@/components/DailyChallenge";
import DailyDialogs from "@/components/dialogs/DailyDialogs";
import { useGameSession } from "@/hooks/useGameSession";
import { consumePlayIntent } from "@/lib/dailyIntent";

/**
 * Wait for an automatic start before handing the page back. Generous: the
 * first request of the day generates the board, which may take many attempts.
 */
const AUTO_START_TIMEOUT_MS = 15_000;

/**
 * The interactive half of /daily. The attempt is NOT started on mount: that
 * would spend a search-result visitor's one attempt before they chose to play,
 * and hand a crawler an empty grid instead of the intro (server-rendered in
 * page.tsx). `startDaily` runs on the click.
 *
 * Leaving navigates: `leaveDaily` alone lands back on this route's intro, but
 * the state still has to be cleared (a stale clock gets recorded as a run).
 */
export default function DailyClient({ intro }: { intro: React.ReactNode }) {
    const { socket, actions } = useGameSession();
    const router = useRouter();

    /*
     * `dailyStatus` tracks the BOARD: 'idle' until the server answers. `dailyActive`
     * means "the daily view is showing", and on this route the intro is that too.
     */
    const attemptLoaded = useMinesweeperStore((state) => state.dailyStatus !== "idle");

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
     * `startDaily` is a no-op until `useSocket`'s effect has run, but the button
     * is live from hydration. A click in that gap is held and fired when the
     * socket lands; disabling the button would grey the CTA on every load.
     */
    const startPending = React.useRef(false);

    const requestStart = React.useCallback(() => {
        if (!socket) {
            startPending.current = true;
            return;
        }
        startDaily();
    }, [socket, startDaily]);

    React.useEffect(() => {
        if (!socket || !startPending.current) return;
        startPending.current = false;
        startDaily();
    }, [socket, startDaily]);

    /*
     * Arriving on "Play Today's Puzzle" (lib/dailyIntent.ts) skips the intro:
     * that control already said play. `autoStarting` is separate from the
     * pending-click ref because it also suppresses the intro for the round trip;
     * one frame survives regardless, since the route is statically rendered.
     */
    const [autoStarting, setAutoStarting] = React.useState(false);
    const autoStarted = React.useRef(false);

    React.useEffect(() => {
        if (autoStarted.current || !consumePlayIntent()) return;
        autoStarted.current = true;
        setAutoStarting(true);
        requestStart();
    }, [requestStart]);

    /*
     * `startDaily`'s handler emits nothing on failure, so a dropped socket
     * would leave a loading line with no board, intro or button. Falling back
     * to the intro IS the retry.
     */
    React.useEffect(() => {
        if (!autoStarting || attemptLoaded) return;
        const timer = setTimeout(() => setAutoStarting(false), AUTO_START_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [autoStarting, attemptLoaded]);

    const leaveDaily = React.useCallback(() => {
        clearDailyState();
        router.push("/");
    }, [clearDailyState, router]);

    return (
        <>
            <ConnectionBanner />
            {attemptLoaded ? (
                <DailyChallenge
                    leaveDaily={leaveDaily}
                    dailyOpenCell={actions.dailyOpenCell}
                    dailyChordCell={actions.dailyChordCell}
                    dailyToggleFlag={actions.dailyToggleFlag}
                    getDailyLeaderboard={actions.getDailyLeaderboard}
                />
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
