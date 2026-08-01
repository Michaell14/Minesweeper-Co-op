// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DIALOGS } from "@/lib/dialogs";
import Button from "./Button";
import Dialog, { DialogClose } from "./Dialog";

/**
 * The dialog shell, and the one thing about it that fails silently.
 *
 * These are native <dialog> elements closed by SUBMITTING their
 * `method="dialog"` form. So a close button is only a close button if its type
 * is "submit" — and <Button> deliberately defaults to "button" so an ordinary
 * button inside the landing form does not submit it by accident. Put a plain
 * <Button> in an actions row and the dialog stops closing, with nothing wrong
 * in the markup, nothing in the console, and a rendering test that still passes
 * if it only checks the button is on screen.
 *
 * That is what these assert against: not that the buttons exist, but that the
 * one meant to dismiss carries the type that actually dismisses.
 */

/**
 * Renders a dialog and opens it.
 *
 * Opening matters for more than realism: a closed <dialog> is inert, so nothing
 * inside it is in the accessibility tree and every `getByRole` finds nothing.
 * Querying a closed dialog would mean reaching past that with `hidden: true`,
 * which is exactly the check worth keeping — a control users cannot reach is
 * not a control.
 *
 * jsdom implements <dialog> but not showModal's focus trapping; `open` is what
 * submitting actually flips, and it is all these need.
 */
const renderOpen = (ui: React.ReactElement, id: string) => {
    const result = render(ui);
    const dialog = document.getElementById(id) as HTMLDialogElement;
    dialog.open = true;
    return { ...result, dialog };
};

describe("a button that dismisses the dialog", () => {
    test("submits, which is the only thing a <dialog> closes on", () => {
        renderOpen(
            <Dialog id={DIALOGS.gameSummary} title="Done" actions={<DialogClose>Close</DialogClose>} />,
            DIALOGS.gameSummary,
        );

        expect(screen.getByRole("button", { name: "Close" }).getAttribute("type")).toBe("submit");
    });

    /*
     * Both halves of the mechanism, because jsdom implements <dialog> but NOT
     * the bit where submitting a `method="dialog"` form closes it. Asserting
     * `dialog.open === false` here would fail against a perfectly good
     * component, so this checks the two conditions a browser needs and leaves
     * the closing itself to the smoke suite, which drives a real one.
     */
    test("sits in a form the browser closes on submit", () => {
        renderOpen(
            <Dialog id={DIALOGS.gameSummary} title="Done" actions={<DialogClose>Close</DialogClose>} />,
            DIALOGS.gameSummary,
        );

        const form = document.getElementById(DIALOGS.gameSummary)!.querySelector("form")!;
        expect(form.getAttribute("method")).toBe("dialog");
        expect(form.contains(screen.getByRole("button", { name: "Close" }))).toBe(true);
    });

    /*
     * The trap, stated as a test. If <Button> ever starts defaulting to submit,
     * DialogClose stops being necessary and every plain button in the landing
     * form starts submitting it — so this failing is a signal in both
     * directions, not a style preference.
     */
    test("a plain Button does NOT, which is why DialogClose exists", () => {
        render(<Button>Ordinary</Button>);

        expect(screen.getByRole("button", { name: "Ordinary" }).getAttribute("type")).toBe("button");
    });

    test("an explicit type still wins, so a real submit button can be built", () => {
        render(<Button type="submit">Send</Button>);

        expect(screen.getByRole("button", { name: "Send" }).getAttribute("type")).toBe("submit");
    });
});

describe("the shell", () => {
    test("names itself from its title, so the dialog is not announced as unlabelled", () => {
        renderOpen(<Dialog id={DIALOGS.gameSummary} title="Board Cleared!" />, DIALOGS.gameSummary);

        expect(screen.getByRole("dialog", { name: "Board Cleared!" })).toBeDefined();
    });

    /* Outcomes and errors interrupt; prompts do not. */
    test("an alert dialog says it is one", () => {
        renderOpen(<Dialog id={DIALOGS.gameSummary} title="Uh Oh!" alert />, DIALOGS.gameSummary);

        expect(screen.getByRole("alertdialog", { name: "Uh Oh!" })).toBeDefined();
    });

    test("an ordinary dialog does not claim to be an alert", () => {
        renderOpen(<Dialog id={DIALOGS.players} title="Players" />, DIALOGS.players);

        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(screen.getByRole("dialog", { name: "Players" })).toBeDefined();
    });

    test("its body renders inside the form, so buttons there can close it", () => {
        render(
            <Dialog id={DIALOGS.players} title="Players">
                <p>Some content</p>
            </Dialog>,
        );

        const form = document.getElementById(DIALOGS.players)!.querySelector("form")!;
        expect(form.textContent).toContain("Some content");
    });

    test("a validating dialog can intercept its own submit", () => {
        const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
        const { dialog } = renderOpen(
            <Dialog id={DIALOGS.custom} title="Custom" onSubmit={onSubmit} />,
            DIALOGS.custom,
        );

        fireEvent.submit(dialog.querySelector("form")!);

        expect(onSubmit).toHaveBeenCalled();
        expect(dialog.open).toBe(true);
    });
});
