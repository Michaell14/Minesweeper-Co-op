// @vitest-environment jsdom
/**
 * The RECEIVE side of a reaction — the half `settings.emotes` governs.
 *
 * Applied in the handler rather than in the component on purpose: an opted-out
 * player should accumulate no feed state and hear no blip, not render an empty
 * list. Testing it here is testing the thing the setting actually promises.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useMinesweeperStore } from "@/app/store";
import { SERVER_EVENTS } from "@/shared/events";
import { useGameEvents } from "./useGameEvents";
import type { AppSocket } from "@/lib/initSocket";

const fakeSocket = () => ({ id: "sock-me", emit: vi.fn() }) as unknown as AppSocket;
const state = () => useMinesweeperStore.getState();

const receive = (payload: { id: string; name: string; emote: string }) => {
    const handlers = useGameEvents(fakeSocket(), vi.fn());
    (handlers[SERVER_EVENTS.PLAYER_EMOTE] as (p: unknown) => void)(payload);
};

beforeEach(() => {
    state().clearPlayerEmotes();
    state().setSetting("emotes", true);
});

describe("an incoming reaction", () => {
    test("lands in the feed with its sender", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "nice" });

        expect(state().playerEmotes).toHaveLength(1);
        expect(state().playerEmotes[0]).toMatchObject({ id: "sock-alex", name: "Alex", emote: "nice" });
    });

    test("carries a deadline in the future", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "nice" });

        expect(state().playerEmotes[0].expiresAt).toBeGreaterThan(Date.now());
    });

    // The server sends to the whole room including the sender, so this is the
    // ordinary case rather than an edge one.
    test("from yourself lands too", () => {
        receive({ id: "sock-me", name: "Me", emote: "wave" });

        expect(state().playerEmotes).toHaveLength(1);
    });

    test("gets a distinct key per message, so repeats stack", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "nice" });
        receive({ id: "sock-alex", name: "Alex", emote: "nice" });

        const [first, second] = state().playerEmotes;
        expect(first.key).not.toBe(second.key);
    });

    /*
     * A newer build could add an emote this one cannot draw. Dropping it is
     * the same refusal emoteArtById makes — showing a different glyph would
     * put words in somebody's mouth.
     */
    test("this build cannot draw is dropped", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "not-an-emote" });

        expect(state().playerEmotes).toEqual([]);
    });
});

describe("with reactions switched off", () => {
    beforeEach(() => state().setSetting("emotes", false));

    test("nothing reaches the feed", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "nice" });

        expect(state().playerEmotes).toEqual([]);
    });

    /*
     * Including your own. The setting means "no reactions on my screen", and
     * an exception for yourself would leave you emoting into what you believe
     * is a quiet room.
     */
    test("not even your own", () => {
        receive({ id: "sock-me", name: "Me", emote: "wave" });

        expect(state().playerEmotes).toEqual([]);
    });
});

describe("the feed is bounded", () => {
    // The display half of the server's rate limit: a full room can emote
    // faster than anyone reads, and an unbounded feed is a way for one player
    // to push everyone else's reactions off screen.
    test("keeps only the most recent few", () => {
        for (let i = 0; i < 8; i++) receive({ id: `sock-${i}`, name: `P${i}`, emote: "nice" });

        expect(state().playerEmotes.length).toBeLessThanOrEqual(3);
        expect(state().playerEmotes.at(-1)?.name).toBe("P7");
    });
});
