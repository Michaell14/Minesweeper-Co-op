"use client";

import { useEffect, useRef } from "react";
import { useMinesweeperStore } from "@/app/store";

/**
 * Marks the history entry a joined room owns. Exported for the tests and for
 * `leaveRoomViaBack`.
 */
export const ROOM_HISTORY_MARKER = "msRoom";

/**
 * The id carried by the entry THIS join pushed.
 *
 * A bare boolean was not enough. Entries accumulate — every join pushes one and
 * nothing prunes the ones below — so backing out of a room frequently lands on
 * an OLDER room entry, which a boolean cannot tell from the current one. The
 * room stayed joined and Back did nothing, which is the bug this file exists to
 * fix, resurfacing after a second join.
 *
 * Module scope, not a ref: Next's route changes are same-document, so this
 * survives visiting /profile and coming back — which has to be distinguishable
 * from leaving, since that lands on the very entry this id names. A full reload
 * clears it, and the resume that follows pushes a fresh one.
 */
let currentEntryId: number | null = null;
let nextEntryId = 1;

/** The room-entry id on a history state object, or null for anything else. */
const roomEntryId = (state: unknown): number | null => {
    if (!state || typeof state !== "object") return null;
    const id = (state as Record<string, unknown>)[ROOM_HISTORY_MARKER];
    return typeof id === "number" ? id : null;
};

/** Whether a history state is the entry THIS join pushed, rather than an older one. */
const isCurrentRoomEntry = (state: unknown): boolean =>
    currentEntryId !== null && roomEntryId(state) === currentEntryId;

/**
 * Makes the browser Back button leave the ROOM rather than the site.
 *
 * The game is store state on `/` — `playerJoined` swaps Landing for Grid and no
 * URL changes, so the history stack still held whatever came before the site.
 * Back from the middle of a game left entirely, which nothing on screen
 * suggested and no amount of care could undo.
 *
 * A marked entry is pushed at the SAME url on the way in. Same url matters:
 * the room is not a route, and giving Next's router a different path would make
 * it try to navigate one. All the entry has to do is exist, so that Back has
 * something of ours to pop.
 *
 * Mounted by useGameSession, which `/daily` also calls — it reads `playerJoined`
 * and so does nothing there, the same way useMatchReconnect reads its own flag.
 */
export function useRoomHistory(leaveRoom: () => void): void {
    const playerJoined = useMinesweeperStore((state) => state.playerJoined);

    /*
     * Which side of the join we were on last render. A ref rather than state:
     * this exists only to spot the false -> true edge, and pushing on the edge
     * rather than on the value is what keeps a re-render from stacking entries.
     */
    const wasJoined = useRef(false);

    useEffect(() => {
        if (playerJoined && !wasJoined.current) {
            currentEntryId = nextEntryId++;
            window.history.pushState({ [ROOM_HISTORY_MARKER]: currentEntryId }, "");
        }

        /*
         * Left by some other route — the Return to Home button, a room error,
         * a forfeit. The entry we pushed is still the current one, so strip the
         * marker off it rather than trying to pop it.
         *
         * Popping was the first attempt and was wrong: `history.back()` goes to
         * whatever preceded the room, which is only the landing page if that is
         * where the player came from. Arrive from /daily or /profile — both link
         * into a game — and Return to Home walked them back THERE.
         *
         * Disarming leaves the stack length alone, so the next Back does
         * whatever it would have done anyway, and no stale entry is left to be
         * mistaken for a room.
         */
        if (!playerJoined && wasJoined.current && isCurrentRoomEntry(window.history.state)) {
            const { [ROOM_HISTORY_MARKER]: _dropped, ...rest } = window.history.state as Record<string, unknown>;
            window.history.replaceState(rest, "");
            currentEntryId = null;
        }

        wasJoined.current = playerJoined;
    }, [playerJoined]);

    /*
     * `leaveRoom` is read through a ref so this listener is attached once and
     * never re-attached: useGameActions rebuilds its callbacks whenever the
     * socket changes, and a listener that came and went with them could miss a
     * pop that lands in the gap.
     */
    const leaveRef = useRef(leaveRoom);
    leaveRef.current = leaveRoom;

    useEffect(() => {
        const onPop = (event: PopStateEvent) => {
            /*
             * Only from inside a room — acting on any other pop would swallow
             * the landing page's Back and strand someone on a page they were
             * trying to leave.
             */
            if (!useMinesweeperStore.getState().playerJoined) return;

            /*
             * The state belongs to the entry being ARRIVED AT, not the one
             * being left. Landing anywhere that is not THIS room's own entry is
             * what a departure looks like; arriving back on it is a return —
             * coming back from /profile, or a Forward — and is not one.
             *
             * Two ways to get this wrong, both found the hard way. Leaving when
             * the marker is PRESENT is self-consistent and does nothing at all
             * in a real browser, because Back never delivers the entry it just
             * left. Leaving whenever the marker is ABSENT then breaks the
             * return from /profile, which lands right back on it.
             */
            if (!isCurrentRoomEntry(event.state)) {
                currentEntryId = null;
                leaveRef.current();
            }
        };

        window.addEventListener("popstate", onPop);
        return () => window.removeEventListener("popstate", onPop);
    }, []);
}
