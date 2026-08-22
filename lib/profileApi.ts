/**
 * The account REST calls — the client's only HTTP traffic to the game server
 * (everything game-shaped stays on the socket). Bearer-authenticated with the
 * bridge token; the server side is server/controllers/profileController.js.
 *
 * Failure shape: null/false for "not available" (signed out, server down,
 * accounts unconfigured) — the UI shows the signed-out or unavailable state —
 * and a thrown ProfileApiError only for an answered request that refused
 * (invalid name, vanished account), where the message is worth showing.
 */

import { serverURL } from "@/lib/initSocket";
import { getBridgeToken, clearBridgeToken } from "@/lib/authBridge";

export interface ProfileUser {
    id: string;
    provider: string;
    email: string | null;
    displayName: string;
    /** A catalog id from shared/avatars.js. */
    avatar: string;
    createdAt: string;
}

/**
 * Fired on window with the fresh ProfileUser as detail whenever a profile
 * save answers. The Footer's avatar icon listens: it is mounted once in the
 * layout, so without a signal it would show a stale avatar until a full
 * reload after the picker on /profile changed it.
 */
export const PROFILE_UPDATED_EVENT = "ms:profile-updated";

/** Provider ids rendered for humans. Falls back to the raw id. */
const PROVIDER_LABELS: Record<string, string> = {
    github: "GitHub",
    google: "Google",
};
export const providerLabel = (id: string) => PROVIDER_LABELS[id] ?? id;

export class ProfileApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = "ProfileApiError";
        this.status = status;
    }
}

const request = async (method: string, body?: unknown): Promise<Response | null> => {
    const token = await getBridgeToken();
    if (!token) return null;

    try {
        return await fetch(`${serverURL}/api/me`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
    } catch {
        return null; // network failure — same rendering as "not available"
    }
};

/** Reads a refusal's message out of the JSON body, tolerating a non-JSON one. */
const errorFrom = async (res: Response): Promise<ProfileApiError> => {
    let message = "Something went wrong";
    try {
        const data = await res.json();
        if (typeof data?.error === "string") message = data.error;
    } catch {
        // Non-JSON body; keep the generic message.
    }
    return new ProfileApiError(message, res.status);
};

/** The signed-in account, or null when there isn't one to show. */
export async function fetchProfile(): Promise<ProfileUser | null> {
    const res = await request("GET");
    if (!res || !res.ok) return null;
    try {
        const data = await res.json();
        return (data?.user as ProfileUser) ?? null;
    } catch {
        /*
         * A 200 carrying something that is not JSON — a proxy interstitial, a
         * truncated body. Tolerated the same way `errorFrom` tolerates it on
         * the refusal path, because the contract at the top of this file is
         * that only an ANSWERED REFUSAL throws. A raw SyntaxError escaping
         * here reaches callers that only handle fulfilment: the account panel
         * sits on "Loading…" for the rest of the page's life, and a signed-in
         * player following a room link never gets in and is never asked for a
         * name either.
         */
        return null;
    }
}

/**
 * Profile saves run strictly ONE AT A TIME, in call order. The queue is the
 * correctness mechanism, not a nicety: when saves could overlap, ordering
 * bugs arrived in five flavours — responses racing, failed saves suppressing
 * successes, recovery snapshots regressing newer writes — each patched with
 * another rank guard, and review kept finding more, because issue order and
 * server processing order are not reconcilable from the client. Serialised,
 * a response IS the newest server state when it arrives, so it applies and
 * announces unconditionally and every guard went away.
 */
let saveChain: Promise<unknown> = Promise.resolve();

/** One PUT for every profile edit; each caller sends only its own field. */
function updateProfile(body: { displayName?: string; avatar?: string }): Promise<ProfileUser> {
    const run = async (): Promise<ProfileUser> => {
        const res = await request("PUT", body);
        if (!res) throw new ProfileApiError("Accounts are not available right now", 0);
        if (!res.ok) throw await errorFrom(res);
        const data = await res.json();
        const user = data.user as ProfileUser;
        window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: user }));
        return user;
    };
    // Start after the previous save settles — success or failure — and keep
    // the chain itself from ever rejecting.
    const next = saveChain.then(run, run);
    saveChain = next.catch(() => {});
    return next;
}

/** Renames the account. Throws ProfileApiError on refusal (e.g. bad name). */
export const updateDisplayName = (displayName: string): Promise<ProfileUser> =>
    updateProfile({ displayName });

/** Stores a new avatar id. Throws ProfileApiError on refusal (unknown id). */
export const updateAvatar = (avatar: string): Promise<ProfileUser> =>
    updateProfile({ avatar });

/**
 * Deletes the account, hard. Returns whether the server confirmed it; the
 * caller signs out afterwards regardless. Drops the cached bridge token so a
 * lingering tab cannot keep acting as the deleted account.
 */
export async function deleteAccount(): Promise<boolean> {
    const res = await request("DELETE");
    const ok = !!res && (res.status === 204 || res.ok);
    if (ok) clearBridgeToken();
    return ok;
}
