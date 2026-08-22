import { beforeEach, describe, expect, test } from "vitest";
import { useMinesweeperStore } from "@/state/store";
import { DEFAULT_SETTINGS } from "@/lib/settings";

/**
 * The reaction opt-out and the feed already on screen.
 *
 * `settings.emotes` is applied on the receive path, so nothing re-reads it once
 * a reaction is in the store — without the reset, opting out mid-room left the
 * chip to reappear whenever the feed remounted.
 */

const state = () => useMinesweeperStore.getState();

const reaction = (name: string) => ({
    key: `sock-${name}-1`,
    id: `sock-${name}`,
    name,
    emote: "nice",
    expiresAt: Date.now() + 60_000,
});

beforeEach(() => {
    useMinesweeperStore.setState({ settings: { ...DEFAULT_SETTINGS, emotes: true } });
    state().clearPlayerEmotes();
});

describe("turning reactions off", () => {
    test("drops what the feed is already holding", () => {
        state().pushPlayerEmote(reaction("Alex"));

        state().setSetting("emotes", false);

        expect(state().playerEmotes).toEqual([]);
    });

    test("applies to a server sync too", () => {
        state().pushPlayerEmote(reaction("Alex"));

        state().replaceSettings({ ...DEFAULT_SETTINGS, emotes: false });

        expect(state().playerEmotes).toEqual([]);
    });

    test("leaves the feed alone when some other setting changes", () => {
        state().pushPlayerEmote(reaction("Alex"));

        state().setSetting("sound", true);

        expect(state().playerEmotes).toHaveLength(1);
    });

    test("leaves the feed alone when reactions are turned back on", () => {
        state().setSetting("emotes", false);
        state().setSetting("emotes", true);
        state().pushPlayerEmote(reaction("Alex"));

        state().setSetting("chording", false);

        expect(state().playerEmotes).toHaveLength(1);
    });
});
