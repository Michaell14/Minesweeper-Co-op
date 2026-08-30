"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PROFILE_UPDATED_EVENT, fetchProfile, type ProfileUser } from "@/lib/profileApi";

export interface AccountProfile {
    /** The signed-in account, or null: signed out, still loading, or API down. */
    profile: ProfileUser | null;
    /**
     * Whether `profile` is an ANSWER rather than a not-yet. Callers that change
     * behaviour for a signed-in player need this — acting on `profile === null`
     * while the fetch is in flight treats every signed-in player as a guest for
     * the first few hundred milliseconds of the page.
     */
    resolved: boolean;
}

/*
 * One fetch per sign-in, shared by every consumer — the header is in the
 * layout and the landing page mounts this again, so without a shared copy
 * every page issues a GET per consumer. Only a SUCCESSFUL read is shared: a
 * null is not cached, so consumers on a page whose account API is down each
 * retry rather than inheriting the failure.
 *
 * `generation` is what makes the sharing safe across a sign-out. Anything the
 * previous session opened must not reach the next one — neither by writing the
 * copy after it was cleared, nor by having its in-flight promise handed over —
 * or a different person signing in reads the departed account's name and face
 * until an update event or a reload. It also covers the smaller case of an
 * update event landing mid-fetch, where the event is strictly fresher.
 */
let cachedProfile: ProfileUser | null = null;
let inFlight: Promise<ProfileUser | null> | null = null;
let generation = 0;

const loadProfile = (): Promise<ProfileUser | null> => {
    if (cachedProfile) return Promise.resolve(cachedProfile);
    if (!inFlight) {
        const startedAt = generation;
        const pending: Promise<ProfileUser | null> = fetchProfile()
            .then((user) => {
                if (generation !== startedAt) return cachedProfile;
                cachedProfile = user;
                return user;
            })
            .finally(() => {
                // Only clear OUR slot — a later generation may already own it.
                if (inFlight === pending) inFlight = null;
            });
        inFlight = pending;
    }
    return inFlight;
};

/** A save landed, or an account signed out: the shared copy is now wrong. */
const rememberProfile = (user: ProfileUser | null) => {
    generation++;
    cachedProfile = user;
    // The open fetch belongs to the generation that just ended. Leaving it here
    // would hand the next sign-in the previous account's answer.
    inFlight = null;
};

/**
 * Drops the shared copy. For tests, which would otherwise serve one test's
 * account to the next — the same reason profileController exports
 * `clearIdentityCache`.
 *
 * Nothing in the app calls this: a sign-out clears it through the hook, and a
 * save through the update event. The copy is a per-page-load memo, so a rename
 * made in ANOTHER tab does not reach this one until it reloads.
 */
export const clearAccountProfileCache = () => rememberProfile(null);

/**
 * The signed-in account, kept fresh.
 *
 * Fetched once per sign-in, then updated from the profile-updated event: a
 * rename or a new face on /profile has to reach anything already mounted, and
 * without the event it would show the old value until a full reload.
 *
 * Shared rather than copied because of the race below, which is easy to get
 * wrong and invisible when you do.
 */
export function useAccountProfile(): AccountProfile {
    const { status } = useSession();
    const [profile, setProfile] = useState<ProfileUser | null>(null);
    const [resolved, setResolved] = useState(false);

    useEffect(() => {
        if (status === "loading") {
            setResolved(false);
            return;
        }
        if (status !== "authenticated") {
            rememberProfile(null);
            setProfile(null);
            setResolved(true);
            return;
        }

        let cancelled = false;
        /*
         * The initial GET is not part of the save queue, so it can resolve
         * AFTER a save's update event with a snapshot read before that save.
         * Any event heard while the fetch is in flight is strictly fresher —
         * the save it reports was issued after the fetch began — so once one
         * arrives, the fetch result is stale and must not apply.
         */
        let heardUpdate = false;
        loadProfile()
            .then((user) => {
                if (cancelled) return;
                if (!heardUpdate) setProfile(user);
                // Resolved either way: a null here is "the account API had
                // nothing for us", which is an answer, not a pending state.
                setResolved(true);
            })
            // `resolved` has to settle whatever happens: callers WAIT on it,
            // so a promise that never resolves is a page that does nothing.
            .catch(() => { if (!cancelled) setResolved(true); });
        const onProfileUpdated = (event: Event) => {
            heardUpdate = true;
            const user = (event as CustomEvent<ProfileUser>).detail;
            rememberProfile(user);
            setProfile(user);
            setResolved(true);
        };
        window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
        return () => {
            cancelled = true;
            window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
        };
    }, [status]);

    return { profile, resolved };
}
