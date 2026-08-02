import React from "react";
import styles from "./Field.module.css";
import { cx } from "./cx";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
    label?: React.ReactNode;
    /** Shown only when `invalid`. */
    errorText?: React.ReactNode;
    invalid?: boolean;
}

/**
 * Label + control + message. The label is a <p>, not a <label>: these caption
 * groups of radio cards, each of which already owns a real <label>, so a second
 * one would point at nothing or steal the card's click target.
 */
export default function Field({
    label,
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
        </div>
    );
}
