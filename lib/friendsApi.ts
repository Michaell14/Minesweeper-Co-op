/**
 * The friend-graph REST calls, shaped like lib/themesApi.ts: null means "not
 * available" (signed out, server down, accounts unconfigured) and the panel
 * shows that state rather than an empty graph — an empty friend list and a
 * broken one look identical otherwise.
 *
 * A refusal that a person needs to READ (an unknown code, a full list) comes
 * back as a message instead, because those are answers rather than failures.
 */

import { serverURL } from "@/lib/initSocket";
import { getBridgeToken } from "@/lib/authBridge";

/** Somebody else, as the graph shows them. Never an email. */
export interface FriendProfile {
    id: string;
    displayName: string;
    /** A catalog id from shared/avatars.js, or null for a guest-era account. */
    avatar: string | null;
}

export interface FriendGraph {
    friends: FriendProfile[];
    /** Requests waiting on ME. */
    incoming: FriendProfile[];
    /** Requests waiting on somebody else. */
    outgoing: FriendProfile[];
    /**
     * People I have blocked. Only ever MINE — a block placed on me is never
     * reported, which is the point of one. Listed so it can be lifted:
     * otherwise blocking is a one-way door.
     */
    blocked: FriendProfile[];
    /** This account's own code, minted on first read. */
    code: string | null;
}

const request = async (path: string, method: string, body?: unknown): Promise<Response | null> => {
    const token = await getBridgeToken();
    if (!token) return null;
    try {
        return await fetch(`${serverURL}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
    } catch {
        return null;
    }
};

const asProfiles = (value: unknown): FriendProfile[] =>
    Array.isArray(value)
        ? value.filter(
              (entry): entry is FriendProfile =>
                  !!entry && typeof entry.id === "string" && typeof entry.displayName === "string",
          )
        : [];

/** The whole graph, or null when friends are unavailable. */
export async function fetchFriends(): Promise<FriendGraph | null> {
    const res = await request("/api/friends", "GET");
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    return {
        friends: asProfiles(data.friends),
        incoming: asProfiles(data.incoming),
        outgoing: asProfiles(data.outgoing),
        blocked: asProfiles(data.blocked),
        code: typeof data.code === "string" ? data.code : null,
    };
}

/**
 * What an add attempt did. `ok` is whether the graph moved; `message` is what
 * to tell the person either way, which is not the same question — "you are
 * already friends" is not a failure, and "no account with that code" is not a
 * crash.
 */
export interface AddFriendResult {
    ok: boolean;
    message: string;
}

const ADD_MESSAGES: Record<string, string> = {
    requested: "Request sent.",
    // They had already asked, so this call was the second half of an agreement.
    accepted: "You are now friends.",
    "already-friends": "You are already friends.",
    "already-requested": "You have already asked them.",
};

/** Add by code — or accept, if they had already asked. */
export async function addFriendByCode(code: string): Promise<AddFriendResult> {
    const res = await request("/api/friends", "POST", { code });
    if (!res) return { ok: false, message: "Friends are unavailable right now." };

    const data = await res.json().catch(() => null);
    if (res.ok || res.status === 201) {
        const result = typeof data?.result === "string" ? data.result : "";
        return {
            ok: result === "requested" || result === "accepted",
            message: ADD_MESSAGES[result] ?? "Request sent.",
        };
    }
    return {
        ok: false,
        message: typeof data?.error === "string" ? data.error : "That did not work.",
    };
}

export type FriendAction = "accept" | "decline" | "block";

/** Respond to a request, or block. Best-effort: false means nothing moved. */
export async function updateFriendship(userId: string, action: FriendAction): Promise<boolean> {
    const res = await request(`/api/friends/${encodeURIComponent(userId)}`, "PUT", { action });
    return !!res && res.ok;
}

/** Unfriend, cancel a request, or lift my own block. */
export async function removeFriend(userId: string): Promise<boolean> {
    const res = await request(`/api/friends/${encodeURIComponent(userId)}`, "DELETE");
    return !!res && (res.status === 204 || res.ok);
}
