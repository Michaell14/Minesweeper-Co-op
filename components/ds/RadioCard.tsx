import React from "react";
import styles from "./RadioCard.module.css";
import { cx } from "./cx";

interface RadioCardContextValue {
    name: string;
    value: string;
    onChange: (value: string) => void;
}

const RadioCardContext = React.createContext<RadioCardContextValue | null>(null);

export interface RadioCardGroupProps {
    /** Shared radio `name`. Distinct per group, or the groups fight. */
    name: string;
    /** The selected value — this is a controlled group, backed by the store. */
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
    children: React.ReactNode;
    className?: string;
    /** Wrap onto more rows instead of scrolling. For groups of unbounded length. */
    wrap?: boolean;
}

export function RadioCardGroup({
    name,
    value,
    onChange,
    ariaLabel,
    children,
    className,
    wrap = false,
}: RadioCardGroupProps) {
    const ctx = React.useMemo(() => ({ name, value, onChange }), [name, value, onChange]);

    return (
        <RadioCardContext.Provider value={ctx}>
            {/* role="radiogroup" rather than a <fieldset>: the name comes from
                aria-label, which is how the smoke test locates each group. */}
            <div
                role="radiogroup"
                aria-label={ariaLabel}
                className={cx(styles.group, wrap ? styles.wrap : styles.scrollable, className)}
            >
                {children}
            </div>
        </RadioCardContext.Provider>
    );
}

export interface RadioCardProps {
    value: string;
    label: React.ReactNode;
    description?: React.ReactNode;
    /**
     * Fires in addition to the group's onChange. The Custom-size card uses it
     * to open its dimensions dialog.
     */
    onSelect?: () => void;
}

export function RadioCard({ value, label, description, onSelect }: RadioCardProps) {
    const ctx = React.useContext(RadioCardContext);
    if (!ctx) throw new Error("<RadioCard> must be rendered inside <RadioCardGroup>");

    const checked = ctx.value === value;

    /*
     * onClick is the ONLY real handler; onChange below is a deliberate no-op.
     *
     * React synthesises onChange for radios from the same native click event it
     * dispatches onClick from, so wiring both ran this twice per selection —
     * one click on the Custom card called showModal() twice. onClick is the one
     * to keep, because it fires whether or not checkedness changed, which is
     * what lets re-clicking the already-selected Custom card reopen its dialog.
     */
    const handleClick = () => {
        ctx.onChange(value);
        onSelect?.();
    };

    return (
        <label className={styles.card}>
            <input
                type="radio"
                className={styles.input}
                name={ctx.name}
                value={value}
                checked={checked}
                /* Present only to silence React's warning about a `checked` input
                 * with no change handler. See the note above. */
                onChange={() => {}}
                onClick={handleClick}
            />
            <div className={styles.control}>
                <span className={styles.content}>
                    <span className={styles.label}>{label}</span>
                    {description != null && (
                        <span className={styles.description}>{description}</span>
                    )}
                </span>
                <span className={styles.indicator} aria-hidden="true">
                    {checked && <span className={styles.dot} />}
                </span>
            </div>
        </label>
    );
}
