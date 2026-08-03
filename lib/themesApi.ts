/**
 * Custom-theme sync calls — the third and last bearer-authenticated surface,
 * shaped like lib/settingsApi.ts: null/false means "not available" and the
 * local copy stays authoritative.
 */

import { serverURL } from "@/lib/initSocket";
import { getBridgeToken } from "@/lib/authBridge";
import { sanitizeCustomTheme, type CustomTheme } from "@/lib/customThemes";

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

/** The account's themes, sanitised, or null when unavailable. */
export async function fetchThemes(): Promise<CustomTheme[] | null> {
    const res = await request("/api/themes", "GET");
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data?.themes)) return null;
    return data.themes
        .map(sanitizeCustomTheme)
        .filter((t: CustomTheme | null): t is CustomTheme => t !== null);
}

/** Mirrors one theme up. Best-effort. */
export async function saveThemeRemote(theme: CustomTheme): Promise<boolean> {
    const res = await request(`/api/themes/${encodeURIComponent(theme.id)}`, "PUT", { theme });
    return !!res && res.ok;
}

/** Removes one theme from the account. Best-effort. */
export async function deleteThemeRemote(id: string): Promise<boolean> {
    const res = await request(`/api/themes/${encodeURIComponent(id)}`, "DELETE");
    return !!res && (res.status === 204 || res.ok);
}
