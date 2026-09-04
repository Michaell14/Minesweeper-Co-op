"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PROFILE_UPDATED_EVENT, fetchProfile, type ProfileUser } from "@/lib/profileApi";

export interface AccountProfile {
    /** The signed-in account, or null: signed out, still loading, or API down. */
    profile: ProfileUser | null;
    /**
     * Whether `profile` is an ANSWER rather than a not-yet; acting on
     * `profile === null` mid-fetch treats every signed-in player as a guest.
     */
    resolved: boolean;
}

/*
 * One fetch per sign-in, shared by every consumer (the header and the landing
 * page both mount this). Only a SUCCESSFUL read is shared, so consumers retry
 * rather than inherit a failure. `generation` keeps a sign-out's in-flight
 * fetch or late write from reaching the next account, and covers an update
 * event landing mid-fetch, which is strictly fresher.
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
    // The open fetch belongs to the generation that just ended.
    inFlight = null;
};

/**
 * Drops the shared copy. For tests only, like profileController's
 * `clearIdentityCache`; the app clears it through sign-out and the update
 * event. The copy is a per-page-load memo, so a rename in ANOTHER tab does
 * not reach this one until reload.
 */
export const clearAccountProfileCache = () => rememberProfile(null);

/**
 * The signed-in account, fetched once per sign-in and then updated from the
 * profile-updated event so a rename on /profile reaches anything already mounted.
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
         * The initial GET is outside the save queue, so it can resolve AFTER a
         * save's update event with an older snapshot. Any event heard while it
         * is in flight is fresher, so the fetch result must not apply.
         */
        let heardUpdate = false;
        loadProfile()
            .then((user) => {
                if (cancelled) return;
                if (!heardUpdate) setProfile(user);
                // A null here is an answer, not a pending state.
                setResolved(true);
            })
            // `resolved` must settle whatever happens: callers WAIT on it.
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
