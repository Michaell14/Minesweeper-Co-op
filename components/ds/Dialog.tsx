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
    className,
    children,
}: DialogProps) {
    const titleId = `${id}-title`;

    return (
        <dialog
            id={id}
            role={alert ? "alertdialog" : undefined}
            aria-labelledby={titleId}
            className={cx(
                styles.dialog,
                "absolute left-1/2 top-60 -translate-x-1/2",
                className,
            )}
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
