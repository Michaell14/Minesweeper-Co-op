/**
 * The settings sync calls, bearer-authenticated like lib/profileApi.ts. Same
 * failure shape too: null/false for "not available" (signed out, server down,
 * accounts unconfigured) — sync silently waits for a better moment, because
 * settings always have a good local copy to fall back on.
 */

import { serverURL } from "@/lib/initSocket";
import { getBridgeToken } from "@/lib/authBridge";
import { sanitizeSettings, type Settings } from "@/lib/settings";

const request = async (method: string, body?: unknown): Promise<Response | null> => {
    const token = await getBridgeToken();
    if (!token) return null;

    try {
        return await fetch(`${serverURL}/api/settings`, {
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

/**
 * The account's stored settings, sanitised, or null when there are none to
 * apply — covering "never synced", "signed out" and "server unreachable"
 * alike, since all three mean the local copy stays authoritative.
 */
export async function fetchSettings(): Promise<Settings | null> {
    const res = await request("GET");
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || data.settings == null) return null;
    return sanitizeSettings(data.settings);
}

/** Mirrors the blob up. Best-effort: a miss is retried on the next change. */
export async function saveSettings(settings: Settings): Promise<boolean> {
    const res = await request("PUT", { settings });
    return !!res && res.ok;
}
