import React from "react";
import styles from "./Switch.module.css";
import { cx } from "./cx";

export interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Required — the toggle renders no visible text of its own. */
    "aria-label": string;
    className?: string;
}

/**
 * A two-state toggle over a real checkbox, so it is keyboard-operable and
 * announced as a switch without any ARIA of our own beyond the role.
 */
export default function Switch({
    checked,
    onChange,
    className,
    ...aria
}: SwitchProps) {
    return (
        <label className={cx(styles.root, className)}>
            <input
                type="checkbox"
                role="switch"
                className={styles.input}
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                aria-label={aria["aria-label"]}
            />
            <span className={styles.track}>
                <span className={styles.thumb} />
            </span>
        </label>
    );
}
