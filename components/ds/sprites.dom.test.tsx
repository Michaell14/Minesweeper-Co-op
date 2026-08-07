// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { render, waitFor } from "@testing-library/react";
import Sprite, { SpriteDefs } from "./sprites";

/**
 * The two halves of the sprite mechanism: art mounted once as <symbol>, and a
 * <use> per cell pointing at it.
 *
 * Both failures here are silent. Rename a symbol id on one side and every mine
 * on the board renders an empty box — no error, no warning, and the cell still
 * resolves by role and name. And the defs follow `data-theme` through a
 * MutationObserver, so a broken subscription just leaves last month's palette
 * painted.
 */

const drawn = (container: HTMLElement, kind: "mine" | "flag") =>
    container.querySelector(`symbol#ms-sprite-${kind}`)!.innerHTML;

afterEach(() => {
    delete document.documentElement.dataset.theme;
});

describe("the <use> resolves", () => {
    test.each(["mine", "flag"] as const)("%s points at art that exists", (kind) => {
        render(
            <>
                <SpriteDefs />
                <Sprite kind={kind} />
            </>,
        );

        const href = document.querySelector("use")?.getAttribute("href");
        expect(href).toBe(`#ms-sprite-${kind}`);
        expect(document.querySelector(href!)).not.toBeNull();
    });

    test("art is mounted once, however many sprites point at it", () => {
        const { container } = render(
            <>
                <SpriteDefs />
                <Sprite kind="mine" />
                <Sprite kind="mine" />
                <Sprite kind="flag" />
            </>,
        );

        expect(container.querySelectorAll("symbol")).toHaveLength(2);
        expect(container.querySelectorAll("use")).toHaveLength(3);
    });
});

describe("the art follows the painted palette", () => {
    test("a holiday swaps both sprites, and leaving it puts them back", async () => {
        const { container } = render(<SpriteDefs />);
        const before = { mine: drawn(container, "mine"), flag: drawn(container, "flag") };

        document.documentElement.dataset.theme = "halloween";

        await waitFor(() => expect(drawn(container, "mine")).not.toEqual(before.mine));
        expect(drawn(container, "flag")).not.toEqual(before.flag);

        delete document.documentElement.dataset.theme;

        await waitFor(() => expect(drawn(container, "mine")).toEqual(before.mine));
        expect(drawn(container, "flag")).toEqual(before.flag);
    });

    /* Every other palette shares one pair; only the seasonal ones bring art. */
    test("an ordinary palette keeps the default pair", async () => {
        const { container } = render(<SpriteDefs />);
        const before = drawn(container, "mine");

        document.documentElement.dataset.theme = "gameboy";

        // Nothing to wait for, so let the observer settle before asserting.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(drawn(container, "mine")).toEqual(before);
    });

    /*
     * The palette is already on <html> when React mounts — the no-flash script
     * put it there — so the first render has to read it rather than wait for a
     * change that has already happened.
     */
    test("a palette applied before mount is picked up on the first render", () => {
        document.documentElement.dataset.theme = "christmas";
        const seasonal = render(<SpriteDefs />).container;

        delete document.documentElement.dataset.theme;
        const plain = render(<SpriteDefs />).container;

        expect(drawn(seasonal, "mine")).not.toEqual(drawn(plain, "mine"));
    });
});

/*
 * A pinned GENERAL set beats following the palette — but a holiday window
 * beats the pin: seasonal art is paint, same rule as the palette itself, and
 * the pin resumes when the window closes.
 */
describe("a pinned general set", () => {
    test("draws its own art on an ordinary palette", () => {
        const pinned = render(<SpriteDefs pinned="naval" />).container;
        const followed = render(<SpriteDefs />).container;

        expect(drawn(pinned, "mine")).not.toEqual(drawn(followed, "mine"));

        document.documentElement.dataset.theme = "gameboy";
        const stillPinned = render(<SpriteDefs pinned="naval" />).container;

        expect(drawn(stillPinned, "mine")).toEqual(drawn(pinned, "mine"));
    });

    test("a holiday window wins over the pin, and returns it afterwards", async () => {
        const { container } = render(<SpriteDefs pinned="naval" />);
        const naval = drawn(container, "mine");

        document.documentElement.dataset.theme = "halloween";
        await waitFor(() => expect(drawn(container, "mine")).not.toEqual(naval));

        const seasonal = render(<SpriteDefs />).container;
        expect(drawn(container, "mine")).toEqual(drawn(seasonal, "mine"));

        delete document.documentElement.dataset.theme;
        await waitFor(() => expect(drawn(container, "mine")).toEqual(naval));
    });

    test("classic pins the default pair", () => {
        const plain = render(<SpriteDefs />).container;

        document.documentElement.dataset.theme = "gameboy";
        const pinned = render(<SpriteDefs pinned="classic" />).container;

        expect(drawn(pinned, "mine")).toEqual(drawn(plain, "mine"));
        expect(drawn(pinned, "flag")).toEqual(drawn(plain, "flag"));
    });

    /* A stale id from hand-edited storage falls back to following, not blank. */
    test("an unknown id follows the palette", () => {
        const unknown = render(<SpriteDefs pinned="pirate" />).container;
        const followed = render(<SpriteDefs />).container;

        expect(drawn(unknown, "mine")).toEqual(drawn(followed, "mine"));
    });
});
