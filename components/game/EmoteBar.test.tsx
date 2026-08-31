// @vitest-environment jsdom
/**
 * The reaction tray and feed, by accessible name.
 *
 * Everything asserted here fails SILENTLY: a button whose label stops
 * resolving is still a button, a feed that stops announcing is still a row of
 * glyphs, and an expiry that stops running leaves reactions on screen forever
 * with nothing in the console. jsdom has no layout engine, so where the feed
 * SITS is the smoke suite's job — this covers what it says and when it goes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { EMOTES } from "@/shared/emotes";
import { EMOTE_LIFETIME_MS } from "@/lib/emotes";
import EmoteBar from "./EmoteBar";
import styles from "./emotes.module.css";

const push = (over: Partial<{ key: string; id: string; name: string; emote: string; expiresAt: number }> = {}) =>
    act(() => {
        useMinesweeperStore.getState().pushPlayerEmote({
            key: "k1",
            id: "sock-1",
            name: "Alex",
            emote: "nice",
            expiresAt: Date.now() + EMOTE_LIFETIME_MS,
            ...over,
        });
    });

beforeEach(() => {
    useMinesweeperStore.getState().clearPlayerEmotes();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useMinesweeperStore.getState().clearPlayerEmotes();
});

describe("the tray", () => {
    it("offers every catalog emote by its label", () => {
        render(<EmoteBar sendEmote={vi.fn()} />);
        for (const { label } of EMOTES) {
            expect(screen.getByRole("button", { name: label })).toBeTruthy();
        }
    });

    it("sends the catalog id, not the label", () => {
        const sendEmote = vi.fn();
        render(<EmoteBar sendEmote={sendEmote} />);

        fireEvent.click(screen.getByRole("button", { name: "Nice" }));

        expect(sendEmote).toHaveBeenCalledWith("nice");
    });

    /*
     * The tray is never gated on `settings.emotes` — that setting governs what
     * you SEE, not what you may say. Wiring it to the buttons would silently
     * turn a display preference into a mute.
     */
    it("still sends with reactions switched off", () => {
        act(() => useMinesweeperStore.getState().setSetting("emotes", false));
        const sendEmote = vi.fn();
        render(<EmoteBar sendEmote={sendEmote} />);

        fireEvent.click(screen.getByRole("button", { name: "Hello" }));

        expect(sendEmote).toHaveBeenCalledWith("wave");
        act(() => useMinesweeperStore.getState().setSetting("emotes", true));
    });
});

describe("the ping button", () => {
    afterEach(() => {
        useMinesweeperStore.getState().setPingArmed(false);
        useMinesweeperStore.getState().setMode("co-op");
    });

    it("arms a ping, and says so", () => {
        render(<EmoteBar sendEmote={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "Ping a cell" }));

        expect(useMinesweeperStore.getState().pingArmed).toBe(true);
        // The name moves with the state: a toggle whose label never changes
        // reads as a dead button to anyone not looking at the colour.
        const armed = screen.getByRole("button", { name: "Cancel ping" });
        expect(armed.getAttribute("aria-pressed")).toBe("true");
    });

    it("disarms when pressed again", () => {
        render(<EmoteBar sendEmote={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "Ping a cell" }));
        fireEvent.click(screen.getByRole("button", { name: "Cancel ping" }));

        expect(useMinesweeperStore.getState().pingArmed).toBe(false);
    });

    /*
     * Both racers play the same board, so the server refuses a ping in PVP —
     * offering the control there would be offering one that does nothing.
     * The reactions stay, because an emote carries no board information.
     */
    it("is not offered in a race, though the reactions are", () => {
        act(() => useMinesweeperStore.getState().setMode("pvp"));
        render(<EmoteBar sendEmote={vi.fn()} />);

        expect(screen.queryByRole("button", { name: "Ping a cell" })).toBeNull();
        expect(screen.getByRole("button", { name: "Nice" })).toBeTruthy();
    });
});

describe("the feed", () => {
    it("shows who reacted", () => {
        render(<EmoteBar sendEmote={vi.fn()} />);
        push();

        expect(screen.getByText("Alex")).toBeTruthy();
    });

    /*
     * The glyphs are aria-hidden, so this text IS the reaction as far as a
     * screen reader is concerned. It reads as a thing said — "Alex: Nice" —
     * rather than as a description of a picture.
     */
    it("announces the latest reaction as speech", () => {
        const { container } = render(<EmoteBar sendEmote={vi.fn()} />);
        push();

        const live = container.querySelector('[aria-live="polite"]');
        expect(live?.textContent).toBe("Alex: Nice");
    });

    it("announces politely, never interrupting", () => {
        const { container } = render(<EmoteBar sendEmote={vi.fn()} />);
        expect(container.querySelector('[aria-live="assertive"]')).toBeNull();
        expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    });

    it("clears a reaction once its lifetime is up", () => {
        vi.useFakeTimers();
        render(<EmoteBar sendEmote={vi.fn()} />);
        push();
        expect(screen.getByText("Alex")).toBeTruthy();

        act(() => void vi.advanceTimersByTime(EMOTE_LIFETIME_MS + 50));

        expect(screen.queryByText("Alex")).toBeNull();
    });

    /*
     * The timer is scheduled off a monotonic clock and the deadline is compared
     * against `Date.now()`, so the callback can run a hair before the wall
     * clock agrees the chip is due. Expiring nothing leaves the store's array
     * identity alone, so an expiry loop re-armed by that array would stop dead
     * here and strand the chip until the next reaction arrived. Caught in
     * review; the loop re-arms from the callback instead.
     *
     * `advanceTimersByTime` moves fake timers and `Date.now()` in lockstep,
     * which is the one condition under which this never reproduces — hence the
     * hand-driven clock.
     */
    it("keeps expiring after a timer fires before its deadline", () => {
        vi.useFakeTimers();
        let clock = Date.now();
        vi.spyOn(Date, "now").mockImplementation(() => clock);

        render(<EmoteBar sendEmote={vi.fn()} />);
        push({ expiresAt: clock + EMOTE_LIFETIME_MS });

        // The timer fires with the wall clock 1ms short: nothing expires.
        act(() => { clock += EMOTE_LIFETIME_MS - 1; vi.advanceTimersByTime(EMOTE_LIFETIME_MS); });
        expect(screen.getByText("Alex"), "not due yet — it should still be here").toBeTruthy();

        // Past the deadline now. Something must still be scheduled to notice.
        act(() => { clock += 50; vi.advanceTimersByTime(50); });
        expect(screen.queryByText("Alex")).toBeNull();
    });

    /*
     * A tab that slept through its timeout must catch up rather than hold a
     * stale chip forever — the expiry compares deadlines against now instead
     * of trusting that each timer fired.
     */
    it("drops anything already past its deadline on the next tick", () => {
        vi.useFakeTimers();
        render(<EmoteBar sendEmote={vi.fn()} />);
        push({ name: "Stale", expiresAt: Date.now() - 1 });

        act(() => void vi.advanceTimersByTime(50));

        expect(screen.queryByText("Stale")).toBeNull();
    });

    // A name is up to 50 characters on the wire; uncapped, three chips of one
    // tile into rows tall enough to cover the bottom of the board.
    it("caps a long name rather than letting the chip grow without bound", () => {
        render(<EmoteBar sendEmote={vi.fn()} />);
        push({ name: "M".repeat(50) });

        // The cap itself is `max-width` in the stylesheet, which jsdom has no
        // layout engine to apply — so this asserts the capped class is on the
        // element the name renders into, and emotes.module.css owns the rest.
        const name = screen.getByText("M".repeat(50));
        expect(name.className).toContain(styles.name);
    });

    // Two reactions from ONE player are two entries, not one that jumps: the
    // key is per message, not per sender.
    it("stacks repeat reactions from the same player", () => {
        render(<EmoteBar sendEmote={vi.fn()} />);
        push({ key: "k1", name: "Alex" });
        push({ key: "k2", name: "Alex" });

        expect(screen.getAllByText("Alex")).toHaveLength(2);
    });
});
