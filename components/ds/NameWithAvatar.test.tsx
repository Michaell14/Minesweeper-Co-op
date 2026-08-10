// @vitest-environment jsdom
/**
 * The one rendering of the anonymous-is-a-bare-name rule. The three surfaces
 * that use this (score table, daily leaderboard, PVP banner) each have an
 * integration test; this pins the rule itself where it now lives.
 */
import { expect, test, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NameWithAvatar from "./NameWithAvatar";

afterEach(cleanup);

test("a known avatar id draws beside the name", () => {
    const { container } = render(<NameWithAvatar avatar="fox">Miguel</NameWithAvatar>);
    expect(screen.getByText("Miguel")).toBeTruthy();
    expect(container.querySelector("svg")).not.toBeNull();
});

test.each([null, undefined])("avatar %s renders the bare name — no default face", (avatar) => {
    const { container } = render(<NameWithAvatar avatar={avatar}>Guest</NameWithAvatar>);
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
});
