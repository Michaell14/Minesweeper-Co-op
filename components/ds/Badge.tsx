import React from "react";
import styles from "./Badge.module.css";
import { cx } from "./cx";

export type BadgeIntent = "default" | "primary" | "success" | "warning" | "error";

/** `md` is the strip above the board; `sm` fits inside a tile or a table row. */
export type BadgeSize = "md" | "sm";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    intent?: BadgeIntent;
    size?: BadgeSize;
}

/** A status badge. */
export default function Badge({
    intent = "default",
    size = "md",
    className,
    onClick,
    ...rest
}: BadgeProps) {
    return (
        <span
            className={cx(
                styles.badge,
                styles[intent],
                size === "sm" && styles.sm,
                onClick && styles.clickable,
                className,
            )}
            onClick={onClick}
            {...rest}
        />
    );
}
