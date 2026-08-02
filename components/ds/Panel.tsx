import React from "react";
import pixel from "./pixel.module.css";
import styles from "./Panel.module.css";
import { cx } from "./cx";

// `title` is widened from the DOM attribute (a tooltip string) to a node: here
// it is the panel's heading, not a hover hint.
export interface PanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    /** Rendered knocked out of the top border. Omit for a plain box. */
    title?: React.ReactNode;
    centered?: boolean;
}

/** A bordered region: the room panel, the progress panel, the flag counter. */
export default function Panel({
    title,
    centered = false,
    className,
    children,
    ...rest
}: PanelProps) {
    return (
        <div
            className={cx(pixel.boxed, styles.panel, centered && styles.centered, className)}
            {...rest}
        >
            {title != null && <p className={styles.title}>{title}</p>}
            {children}
        </div>
    );
}
