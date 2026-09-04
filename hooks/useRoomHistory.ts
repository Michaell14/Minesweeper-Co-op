"use client";

import { useEffect, useRef } from "react";
import { useMinesweeperStore } from "@/app/store";

/** Marks the history entry a joined room owns. Exported for the tests and `leaveRoomViaBack`. */
export const ROOM_HISTORY_MARKER = "msRoom";

/**
 * The id carried by the entry THIS join pushed. Entries accumulate (nothing
 * prunes older room entries), so a bare boolean could not tell backing out
 * onto an OLDER room entry from the current one, and Back did nothing. Module
 * scope, not a ref: Next's route changes are same-document, and coming back
 * from /profile lands on this very entry, which must be distinguishable from
 * leaving. A full reload clears it and the resume pushes a fresh one.
 */
let currentEntryId: string | null = null;

/**
 * A fresh id, unique across DOCUMENTS: a reload lands back on the previous
 * document's entry and resume pushes another, so a counter restarting at 1
 * would hand the new entry the old one's id and Back would never leave.
 * `randomUUID` needs a secure context; the fallback is for a dev server
 * reached over plain-http LAN.
 */
const mintEntryId = (): string =>
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** The room-entry id on a history state object, or null for anything else. */
const roomEntryId = (state: unknown): string | null => {
    if (!state || typeof state !== "object") return null;
    const id = (state as Record<string, unknown>)[ROOM_HISTORY_MARKER];
    return typeof id === "string" ? id : null;
};

/** Whether a history state is the entry THIS join pushed, rather than an older one. */
const isCurrentRoomEntry = (state: unknown): boolean =>
    currentEntryId !== null && roomEntryId(state) === currentEntryId;

/**
 * Makes the browser Back button leave the ROOM rather than the site. The game
 * is store state on `/`, so the stack otherwise holds only what came before
 * the site. A marked entry is pushed at the SAME url on the way in: the room
 * is not a route, and a different path would make Next navigate. Mounted by
 * useGameSession; `/daily` never sets `playerJoined`, so it does nothing there.
 */
export function useRoomHistory(leaveRoom: () => void): void {
    const playerJoined = useMinesweeperStore((state) => state.playerJoined);

    /*
     * A ref, not state: only the false -> true edge matters, and pushing on the
     * edge is what keeps a re-render from stacking entries.
     */
    const wasJoined = useRef(false);

    useEffect(() => {
        if (playerJoined && !wasJoined.current) {
            currentEntryId = mintEntryId();
            window.history.pushState({ [ROOM_HISTORY_MARKER]: currentEntryId }, "");
        }

        /*
         * Left by some other route (Return to Home, a room error, a forfeit).
         * Strip the marker off our entry rather than popping it: `history.back()`
         * goes to whatever preceded the room, which from /daily or /profile is
         * not the landing page. The stack length is untouched, so the next Back
         * does what it would have anyway.
         */
        if (!playerJoined && wasJoined.current && isCurrentRoomEntry(window.history.state)) {
            const { [ROOM_HISTORY_MARKER]: _dropped, ...rest } = window.history.state as Record<string, unknown>;
            window.history.replaceState(rest, "");
            currentEntryId = null;
        }

        wasJoined.current = playerJoined;
    }, [playerJoined]);

    /*
     * `leaveRoom` through a ref so the listener attaches once: useGameActions
     * rebuilds its callbacks on socket change, and a re-attached listener could
     * miss a pop in the gap.
     */
    const leaveRef = useRef(leaveRoom);
    leaveRef.current = leaveRoom;

    useEffect(() => {
        const onPop = (event: PopStateEvent) => {
            /* Only from inside a room, or the landing page's own Back would be swallowed. */
            if (!useMinesweeperStore.getState().playerJoined) return;

            /*
             * The state belongs to the entry being ARRIVED AT. Landing anywhere
             * but this room's own entry is a departure; arriving back on it
             * (from /profile, or a Forward) is not. Back never delivers the
             * entry it just left, so leaving on marker-present does nothing,
             * and leaving on marker-absent breaks the return from /profile.
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
