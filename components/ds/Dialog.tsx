import React from "react";
import styles from "./Dialog.module.css";
import { cx } from "./cx";
import Button, { type ButtonProps } from "./Button";
import type { DialogId } from "@/lib/dialogs";

/**
 * A button that dismisses its dialog. A native <dialog> closes on submitting
 * its `method="dialog"` form and <Button> defaults to type="button", so a
 * plain Button silently stops closing it.
 */
export function DialogClose(props: Omit<ButtonProps, "type">) {
    return <Button type="submit" {...props} />;
}

export interface DialogProps {
    /** Always a DIALOGS constant — never a bare string. See lib/dialogs.ts. */
    id: DialogId;
    /**
     * The heading and the dialog's accessible name: rendered with a derived id
     * that aria-labelledby points at, so the two cannot drift.
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
     * Fired when the dialog goes away, INCLUDING Escape, which submits no form,
     * so anything a dismissal must undo belongs here rather than on Cancel.
     * Make it idempotent: it listens for both `cancel` and `close` because
     * neither alone covers every path, so one dismissal can fire it twice.
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
     * A native listener, since React 18 does not wire `onClose` for `<dialog>`.
     * Through a ref so it attaches once and still calls the current handler.
     */
    const onCloseRef = React.useRef(onClose);
    onCloseRef.current = onClose;

    React.useEffect(() => {
        const element = dialogRef.current;
        if (!element) return;
        const handle = () => onCloseRef.current?.();
        // Both: in Chrome a close request fires `cancel` and never `close`.
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
