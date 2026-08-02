import React from "react";
import styles from "./Table.module.css";
import { cx } from "./cx";

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
    /** Centres header cells only, matching the classic leaderboard. */
    centered?: boolean;
}

/**
 * A real <table> — a skin, not a replacement for the semantics. The smoke test
 * finds the leaderboard with `table` + `tbody tr`, so the structure has to stay
 * genuinely tabular.
 */
export default function Table({ centered = true, className, ...rest }: TableProps) {
    return (
        <table
            className={cx(
                styles.table,
                styles.bordered,
                centered && styles.centered,
                className,
            )}
            {...rest}
        />
    );
}
