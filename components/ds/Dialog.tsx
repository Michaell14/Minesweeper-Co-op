import React from "react";
import styles from "./Dialog.module.css";
import { cx } from "./cx";
import Button, { type ButtonProps } from "./Button";
import type { DialogId } from "@/lib/dialogs";

/**
 * A button that dismisses its dialog. Exists because the failure mode is silent:
 * a native <dialog> closes on submitting its `method="dialog"` form, and <Button>
 * defaults to type="button", so a plain Button in an actions row simply stops
 * closing the dialog with nothing wrong in the markup.
 */
export function DialogClose(props: Omit<ButtonProps, "type">) {
    return <Button type="submit" {...props} />;
}

export interface DialogProps {
    /** Always a DIALOGS constant — never a bare string. See lib/dialogs.ts. */
    id: DialogId;
    /**
     * The heading, and the dialog's accessible name: it is rendered with a
     * derived id that aria-labelledby points at, so the two cannot drift.
     * Dialogs whose whole body is one sentence pass that sentence here.
     */
    title: React.ReactNode;
    /** role="alertdialog" — for outcomes and errors, not for prompts. */
    alert?: boolean;
    /** Buttons. Rendered in a footer row inside the form, so they can close it. */
    actions?: React.ReactNode;
    actionsAlign?: "between" | "end";
    /** Set for dialogs that validate before closing (the custom board form). */
    onSubmit?: React.FormEventHandler<HTMLFormElement>;
    /**
     * Fired when the dialog goes away, INCLUDING ways the buttons never see.
     *
     * A modal `<dialog>` also closes on a platform close request — Escape — and
     * that path submits no form, so an action wired only to a button silently
     * does not run. Anything a dismissal must undo belongs here rather than on
     * the Cancel button.
     *
     * **Make the handler idempotent.** This can fire more than once for a
     * single dismissal: it listens for both `cancel` and `close` because
     * neither alone covers every path — a close request fires `cancel` and, in
     * Chrome, no `close` at all, while a form submit or `.close()` fires only
     * `close`. The button's own close arrives here too. Guard on whatever the
     * work has already changed.
     */
    onClose?: () => void;
    className?: string;
    children?: React.ReactNode;
}

/** The one dialog shell: positioning, the form, the aria wiring, an action row. */
export default function Dialog({
    id,
    title,
    alert = false,
    actions,
    actionsAlign = "end",
    onSubmit,
    onClose,
    className,
    children,
}: DialogProps) {
    const titleId = `${id}-title`;
    const dialogRef = React.useRef<HTMLDialogElement>(null);

    /*
     * A native listener rather than React's `onClose`, which React 18 does not
     * wire up for `<dialog>`. Read through a ref so the listener is attached
     * once and still calls the current handler.
     */
    const onCloseRef = React.useRef(onClose);
    onCloseRef.current = onClose;

    React.useEffect(() => {
        const element = dialogRef.current;
        if (!element) return;
        const handle = () => onCloseRef.current?.();
        // Both, because neither covers every dismissal on its own — measured in
        // Chrome, where a close request fires `cancel` and never `close`.
        element.addEventListener("cancel", handle);
        element.addEventListener("close", handle);
        return () => {
            element.removeEventListener("cancel", handle);
            element.removeEventListener("close", handle);
        };
    }, []);

    return (
        <dialog
            ref={dialogRef}
            id={id}
            role={alert ? "alertdialog" : undefined}
            aria-labelledby={titleId}
            className={cx(styles.dialog, className)}
        >
            <form method="dialog" onSubmit={onSubmit}>
                <p id={titleId} className={styles.title}>{title}</p>
                {children}
                {actions && (
                    <menu className={cx(styles.actions, styles[actionsAlign])}>
                        {actions}
                    </menu>
                )}
            </form>
        </dialog>
    );
}
