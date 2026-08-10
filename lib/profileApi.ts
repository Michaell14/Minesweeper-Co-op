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
    const data = await res.json();
    return (data?.user as ProfileUser) ?? null;
}

/**
 * Announces a fresh ProfileUser to event listeners (the Footer's avatar).
 * Exported for the one caller outside this module: AccountPanel's failed-save
 * re-sync, which fetches the server's truth and must let listeners converge
 * on it — the overlapping success it corrects for was suppressed below.
 */
export const announceProfileUpdated = (user: ProfileUser): void => {
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: user }));
};

/**
 * Save ordering for the event channel. `saveSeq` stamps each save at issue;
 * `announcedSeq` records the newest save whose response has broadcast. A
 * response announces only if nothing NEWER has announced already — comparing
 * against issued saves instead would let a newer save that FAILED (and so
 * wrote nothing) suppress an older success whose user is still the truth.
 */
let saveSeq = 0;
let announcedSeq = 0;

/** One PUT for every profile edit; each caller sends only its own field. */
async function updateProfile(body: { displayName?: string; avatar?: string }): Promise<ProfileUser> {
    const seq = ++saveSeq;
    const res = await request("PUT", body);
    if (!res) throw new ProfileApiError("Accounts are not available right now", 0);
    if (!res.ok) throw await errorFrom(res);
    const data = await res.json();
    const user = data.user as ProfileUser;
    // Listeners apply these events unconditionally, so an older save's
    // response must not broadcast over a newer one's. If a newer save is
    // still in flight, announcing now is fine: its own response (or its
    // failure re-sync) will re-announce, and the last event wins.
    if (seq > announcedSeq) {
        announcedSeq = seq;
        announceProfileUpdated(user);
    }
    return user;
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
