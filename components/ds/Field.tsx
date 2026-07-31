import React from "react";
import styles from "./Field.module.css";
import { cx } from "./cx";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
    label?: React.ReactNode;
    helperText?: React.ReactNode;
    /** Shown only when `invalid` — matching the Chakra Field it replaces. */
    errorText?: React.ReactNode;
    invalid?: boolean;
}

/**
 * Label + control + message.
 *
 * The label is a <p> rather than a <label> on purpose: these caption groups of
 * radio cards, and each card already owns a real <label> wrapping its own
 * input. A second <label> here would either point at nothing or steal the
 * click target from the card the user aimed at.
 */
export default function Field({
    label,
    helperText,
    errorText,
    invalid = false,
    className,
    children,
    ...rest
}: FieldProps) {
    return (
        <div className={cx(styles.field, className)} {...rest}>
            {label != null && <p className={styles.label}>{label}</p>}
            {children}
            {invalid && errorText != null && (
                <p className={styles.error} role="alert">{errorText}</p>
            )}
            {!invalid && helperText != null && (
                <p className={styles.helper}>{helperText}</p>
            )}
        </div>
    );
}
