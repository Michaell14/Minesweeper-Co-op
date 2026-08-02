import React from "react";
import styles from "./Badge.module.css";
import { cx } from "./cx";

export type BadgeIntent = "default" | "primary" | "success" | "warning" | "error";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    intent?: BadgeIntent;
}

/** A status badge. */
export default function Badge({
    intent = "default",
    className,
    onClick,
    ...rest
}: BadgeProps) {
    return (
        <span
            className={cx(styles.badge, styles[intent], onClick && styles.clickable, className)}
            onClick={onClick}
            {...rest}
        />
    );
}
