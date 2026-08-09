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
 * How long to wait for the server to answer an automatic start before handing
 * the page back.
 *
 * Generous on purpose: the first request of the day generates the board, and
 * the no-guess generator may try many candidates before one is solvable.
 */
const AUTO_START_TIMEOUT_MS = 15_000;

/**
 * The interactive half of /daily.
 *
 * The attempt is NOT started on mount, deliberately. Arriving here from a search
 * result would otherwise consume the visitor's one attempt for the day before
 * they had decided to play, and it would hand a crawler a grid of empty cells in
 * place of the page's text. The intro (server-rendered, in page.tsx) is what
 * both of them see first; `startDaily` runs on the click.
 *
 * Leaving navigates. `leaveDaily` alone only clears the daily state, which used
 * to be the whole job when the daily was a branch of `/` — it landed the player
 * on Landing. On its own route that same call lands them back on this page's
 * intro, while the button they pressed says "Return to Home". The state still
 * has to be cleared (a stale clock gets recorded as a run), so the push is added
 * to it rather than replacing it.
 */
export default function DailyClient({ intro }: { intro: React.ReactNode }) {
    const { socket, actions } = useGameSession();
    const router = useRouter();

    /*
     * The BOARD is what `dailyStatus` tracks — 'idle' until the server answers
     * `startDaily`, and back to 'idle' on `resetDailyState`. `dailyActive` used
     * to stand in for this, which is what broke the guard below: it means "the
     * daily view is showing" (state/dailySlice.ts), and on this route the intro
     * is the daily view just as much as the board is.
     */
    const attemptLoaded = useMinesweeperStore((state) => state.dailyStatus !== "idle");

    const { leaveDaily: clearDailyState, leaveRoom, cancelMatch, startDaily } = actions;

    /*
     * Being on this route IS the daily view, board or no board.
     *
     * hooks/useGameEvents.ts reads `dailyActive` to refuse a SESSION_RESUME
     * offer — "picking daily is a real choice". While this was gated on the
     * board, the intro sat outside that guard: arriving from a room, the
     * server's resume offer was accepted behind the intro, and "Return to
     * Home" landed the player back in the room they had just walked out of.
     *
     * Set before the socket exists (this effect has no deps and the one below
     * waits on `socket`), so the flag is up before any offer can arrive.
     */
    React.useEffect(() => {
        useMinesweeperStore.getState().setDailyActive(true);
        // Navigating away ends the view. Uses the full leave rather than
        // `resetDailyState` so the run clock goes too — left standing, the next
        // room to announce a win records it as a time this browser played.
        return clearDailyState;
    }, [clearDailyState]);

    /*
     * Choosing the daily leaves the room, rather than quietly holding both.
     *
     * The two views share gameSlice's board and are meant to be exclusive, and
     * a player left behind in a room is still on its roster and still scoring
     * for teammates who can see them sitting there. Guarding the resume offer
     * above is not enough on its own: the membership is real, so it has to be
     * given up, and PLAYER_LEAVE is what calls `forgetRoom` server-side — the
     * one exit that is never resumed (server/controllers/sessionController.js).
     *
     * Waits on the socket because both emits need one. A queued quick match is
     * covered for the same reason, though its modal makes it hard to reach.
     */
    React.useEffect(() => {
        if (!socket) return;
        const { playerJoined, matchSearching } = useMinesweeperStore.getState();
        if (playerJoined) leaveRoom();
        else if (matchSearching) cancelMatch();
    }, [socket, leaveRoom, cancelMatch]);

    /*
     * `startDaily` is a silent no-op until `useSocket`'s effect has run, and the
     * button is live from the moment the page hydrates. The gap is short — a
     * commit and a passive-effect flush — but a click landing in it does
     * nothing at all and says nothing, on the page's only call to action. So
     * the intent is held rather than dropped, and fires when the socket lands.
     * Disabling the button instead would grey out the CTA on every load for the
     * same interval, which is the worse trade.
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
     * Arriving on a press of "Play Today's Puzzle" (lib/dailyIntent.ts) skips
     * the intro entirely: that control already said play, and meeting it with
     * prose and a second button of the same name reads as the first click not
     * having worked.
     *
     * `autoStarting` is separate from the pending-click ref because it also has
     * to suppress the intro. Waiting for the board without it would leave the
     * whole page of copy on screen for a socket round trip, which is the flash
     * this exists to remove — one frame of it survives regardless, since the
     * route is statically rendered and the intro is what hydrates.
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
     * Give the page back if the answer never comes.
     *
     * `startDaily`'s handler emits nothing on failure — its catch only logs —
     * so a dropped socket or a Redis blip leaves nothing to wait for. Without
     * this the player is left on a loading line with no board, no intro and no
     * button: a dead end where the pre-auto-start version simply still had the
     * button to press. Falling back to the intro IS the retry.
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
