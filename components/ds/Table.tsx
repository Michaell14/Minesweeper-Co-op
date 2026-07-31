import React from "react";
import styles from "./Table.module.css";
import { cx } from "./cx";

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
    bordered?: boolean;
    centered?: boolean;
}

/**
 * A real <table>. The smoke test finds the leaderboard with
 * `table` + `tbody tr` and checks offsetParent for visibility, so the element
 * and its structure have to stay genuinely tabular — this is a skin, not a
 * replacement for the semantics.
 */
export default function Table({
    bordered = true,
    centered = true,
    className,
    ...rest
}: TableProps) {
    return (
        <table
            className={cx(
                styles.table,
                bordered && styles.bordered,
                centered && styles.centered,
                className,
            )}
            {...rest}
        />
    );
}
