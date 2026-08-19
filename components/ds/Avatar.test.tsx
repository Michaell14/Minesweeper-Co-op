// @vitest-environment jsdom
/**
 * The hover frames fail silently in both directions: a missing frame is a face
 * that just sits there, and a frame rendered where it was not asked for is a
 * score table quietly carrying three copies of every avatar. jsdom runs no
 * animation, so this pins what is in the DOM — the motion itself is CSS.
 */
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Avatar from "./Avatar";
import { AVATAR_HOVER_FRAMES } from "./avatarArt";
import { AVATARS } from "@/shared/avatars";

afterEach(cleanup);

const frameCount = (container: HTMLElement) => container.querySelectorAll("svg > g").length;

test("an animated avatar draws every frame of its cycle", () => {
    const { container } = render(<Avatar id="frog" animated />);
    expect(frameCount(container)).toBe(1 + AVATAR_HOVER_FRAMES.frog.length);
});

test("without `animated` only the base frame is in the DOM", () => {
    const { container } = render(<Avatar id="frog" />);
    expect(frameCount(container)).toBe(1);
});

test.each(AVATARS.map((a) => a.id))("%s animates when asked", (id) => {
    const { container } = render(<Avatar id={id} animated />);
    expect(frameCount(container)).toBe(1 + AVATAR_HOVER_FRAMES[id].length);
});

test("an unknown id falls back to the default face", () => {
    const { container } = render(<Avatar id="no-such-avatar" />);
    expect(container.querySelector("svg")?.getAttribute("data-avatar")).toBe("classic");
});
