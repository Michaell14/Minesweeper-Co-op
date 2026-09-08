// @vitest-environment jsdom
/**
 * The profile-save queue. One request in flight at a time, in call order, is
 * what makes every response the newest server state, so the panel and the
 * header need no ordering guards. Pins that ordering, and that a failure does
 * not wedge the queue.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/authBridge", () => ({
    getBridgeToken: vi.fn(async () => "tok"),
    clearBridgeToken: vi.fn(),
}));
vi.mock("@/lib/initSocket", () => ({ serverURL: "http://test" }));

import { PROFILE_UPDATED_EVENT, fetchProfile, updateAvatar, updateDisplayName } from "./profileApi";

const response = (avatar: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ user: { avatar } }),
});

/** Lets queued microtasks and the chained save start. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

it("saves run one at a time, in call order", async () => {
    let resolveFox!: (value: unknown) => void;
    const fetchMock = vi.fn()
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFox = resolve; }))
        .mockResolvedValueOnce(response("penguin"));
    vi.stubGlobal("fetch", fetchMock);

    const fox = updateAvatar("fox");
    const penguin = updateAvatar("penguin");
    await settle();
    // The second save must not leave the queue while the first is open.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFox(response("fox"));
    await fox;
    await penguin;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(heard).toEqual(["fox", "penguin"]);
});

it("a failed save does not wedge the queue — the next one still runs", async () => {
    vi.stubGlobal(
        "fetch",
        vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ error: "Invalid display name" }),
            })
            .mockResolvedValueOnce(response("robot")),
    );

    const rename = updateDisplayName("   ");
    const robot = updateAvatar("robot");
    await expect(rename).rejects.toThrow("Invalid display name");
    await robot;

    expect(heard).toEqual(["robot"]);
});

it("a lone save broadcasts its response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response("kitty")));

    await updateAvatar("kitty");

    expect(heard).toEqual(["kitty"]);
});

/* The read path must resolve, not reject: everything downstream only handles fulfilment. */
it("answers null when a 200 carries something that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError("Unexpected token < in JSON"); },
    })));

    await expect(fetchProfile()).resolves.toBeNull();
});

it("answers null when the body has no user", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));

    await expect(fetchProfile()).resolves.toBeNull();
});
