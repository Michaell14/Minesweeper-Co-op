// @vitest-environment jsdom
/**
 * The profile-updated event's ordering guarantee. Listeners (the Footer's
 * avatar) apply these events unconditionally, so the guarantee lives HERE:
 * only the latest save's response may broadcast. Without it, an older save
 * resolving last parks every listener on a stale avatar — silently, since
 * the caller's own state is protected by its ticket guard.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authBridge", () => ({
    getBridgeToken: vi.fn(async () => "tok"),
    clearBridgeToken: vi.fn(),
}));
vi.mock("@/lib/initSocket", () => ({ serverURL: "http://test" }));

import {
    PROFILE_UPDATED_EVENT,
    announceProfileUpdated,
    updateAvatar,
    updateDisplayName,
} from "./profileApi";

const response = (avatar: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ user: { avatar } }),
});

let heard: string[] = [];
const listener = (event: Event) => heard.push((event as CustomEvent).detail.avatar);

beforeEach(() => {
    heard = [];
    window.addEventListener(PROFILE_UPDATED_EVENT, listener);
});

afterEach(() => {
    window.removeEventListener(PROFILE_UPDATED_EVENT, listener);
    vi.unstubAllGlobals();
});

it("a stale response never broadcasts over a newer save's", async () => {
    let resolveFox!: (value: unknown) => void;
    vi.stubGlobal(
        "fetch",
        vi.fn()
            .mockImplementationOnce(() => new Promise((resolve) => { resolveFox = resolve; }))
            .mockResolvedValueOnce(response("penguin")),
    );

    const fox = updateAvatar("fox");
    const penguin = updateAvatar("penguin");
    await penguin;
    // The older save's response arrives last — it must stay silent.
    resolveFox(response("fox"));
    await fox;

    expect(heard).toEqual(["penguin"]);
});

it("a newer save that FAILED does not suppress an older success's broadcast", async () => {
    // The avatar save is in flight when a rename is issued and refused. The
    // rename wrote nothing, so the avatar's response is still the server's
    // truth and must reach listeners — comparing against ISSUED saves here
    // would leave the footer stale until a reload.
    let resolveFox!: (value: unknown) => void;
    vi.stubGlobal(
        "fetch",
        vi.fn()
            .mockImplementationOnce(() => new Promise((resolve) => { resolveFox = resolve; }))
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: "Invalid display name" }),
            }),
    );

    const fox = updateAvatar("fox");
    await expect(updateDisplayName("   ")).rejects.toThrow("Invalid display name");
    resolveFox(response("fox"));
    await fox;

    expect(heard).toEqual(["fox"]);
});

it("a lone save broadcasts its response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response("robot")));

    await updateAvatar("robot");

    expect(heard).toEqual(["robot"]);
});

it("announceProfileUpdated reaches listeners — the re-sync escape hatch", () => {
    announceProfileUpdated({ avatar: "kitty" } as never);

    expect(heard).toEqual(["kitty"]);
});
