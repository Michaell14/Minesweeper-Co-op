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
 * ONE fetch per sign-in, shared by every consumer.
 *
 * The Footer is in the layout and the landing page mounts this again, so
 * without a shared copy every page issues a GET per consumer — and this hook
 * exists to be reused, so that number only grows.
 *
 * `generation` guards the same race the hook does below: an update event heard
 * while a fetch is in flight is strictly fresher, so the fetch must not write
 * its stale answer into the cache that LATER mounts will read.
 *
 * A failed fetch caches nothing. Null here means "the account API had nothing
 * for us", and pinning that would leave the page unable to recover.
 */
let cachedProfile: ProfileUser | null = null;
let inFlight: Promise<ProfileUser | null> | null = null;
let generation = 0;

const loadProfile = (): Promise<ProfileUser | null> => {
    if (cachedProfile) return Promise.resolve(cachedProfile);
    if (!inFlight) {
        const startedAt = generation;
        inFlight = fetchProfile()
            .then((user) => {
                if (generation === startedAt) cachedProfile = user;
                return cachedProfile ?? user;
            })
            .finally(() => { inFlight = null; });
    }
    return inFlight;
};

/** A save landed, or an account signed out: the shared copy is now wrong. */
const rememberProfile = (user: ProfileUser | null) => {
    generation++;
    cachedProfile = user;
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
            .catch(() => {
                /*
                 * `fetchProfile` answers with null rather than throwing, so
                 * this should be unreachable — it is here because `resolved`
                 * must become true no matter what. Callers WAIT on it (the
                 * join-link path decides nothing until it settles), so a
                 * promise that never resolves is not a degraded page, it is a
                 * page that silently does nothing.
                 */
                if (!cancelled) setResolved(true);
            });
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
