// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { DIALOGS, openDialog, closeDialog } from "./dialogs";

/**
 * Opening a dialog twice. `showModal()` THROWS on an open dialog, and these are
 * opened from socket handlers where the same outcome legitimately arrives
 * twice; the exception aborts the handler. jsdom does not implement
 * `showModal`, so the spec's behaviour is installed here.
 */

const ID = DIALOGS.gameSummary;

let showModal: ReturnType<typeof vi.fn>;

const mountDialog = () => {
    document.body.innerHTML = `<dialog id="${ID}"></dialog>`;
    const dialog = document.getElementById(ID) as HTMLDialogElement;

    showModal = vi.fn(() => {
        // https://html.spec.whatwg.org/#dom-dialog-showmodal
        if (dialog.open) throw new DOMException("Already open", "InvalidStateError");
        dialog.setAttribute("open", "");
    });
    dialog.showModal = showModal as unknown as HTMLDialogElement["showModal"];
    dialog.close = () => dialog.removeAttribute("open");

    return dialog;
};

beforeEach(() => {
    document.body.innerHTML = "";
});

describe("openDialog", () => {
    test("opens a dialog that is closed", () => {
        const dialog = mountDialog();

        openDialog(ID);

        expect(dialog.open).toBe(true);
        expect(showModal).toHaveBeenCalledTimes(1);
    });

    test("a second open is a no-op, not a thrown handler", () => {
        mountDialog();
        openDialog(ID);

        expect(() => openDialog(ID)).not.toThrow();
        expect(showModal).toHaveBeenCalledTimes(1);
    });

    test("opens again once it has been closed", () => {
        const dialog = mountDialog();
        openDialog(ID);
        closeDialog(ID);

        openDialog(ID);

        expect(dialog.open).toBe(true);
        expect(showModal).toHaveBeenCalledTimes(2);
    });

    test("does nothing for a dialog that is not mounted", () => {
        expect(() => openDialog(ID)).not.toThrow();
    });
});
