import React from "react";
import styles from "./Badge.module.css";
import { cx } from "./cx";

export type BadgeIntent = "default" | "primary" | "success" | "warning" | "error";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    intent?: BadgeIntent;
}

/**
 * A status badge.
 *
 * One element, where NES.css needed a wrapper div sized in ems plus an
 * absolutely-positioned inner span — the wrapper existed only to reserve
 * layout space for a child that had been taken out of flow.
 */
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
