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
            {/* role="radiogroup" rather than <fieldset>: the aria-label is how the smoke test finds each group. */}
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
     * Present but not choosable. Native `disabled`, not `aria-disabled`: arrow
     * keys move a radio group's SELECTION, so an aria-only card would be picked
     * by anyone navigating past it. Say why in `description`.
     */
    disabled?: boolean;
    /** Fires in addition to the group's onChange; the Custom-size card opens its dialog with it. */
    onSelect?: () => void;
}

export function RadioCard({ value, label, description, onSelect, disabled = false }: RadioCardProps) {
    const ctx = React.useContext(RadioCardContext);
    if (!ctx) throw new Error("<RadioCard> must be rendered inside <RadioCardGroup>");

    const checked = ctx.value === value;

    /*
     * onClick is the ONLY real handler; onChange is a no-op. React synthesises
     * onChange from the same click, so wiring both ran this twice (showModal()
     * twice). onClick fires even when checkedness did not change, which lets
     * re-clicking the selected Custom card reopen its dialog.
     */
    const handleClick = () => {
        ctx.onChange(value);
        onSelect?.();
    };

    return (
        <label className={cx(styles.card, disabled && styles.cardDisabled)}>
            <input
                type="radio"
                className={styles.input}
                name={ctx.name}
                value={value}
                checked={checked}
                disabled={disabled}
                /* Only to silence React's warning about a `checked` input with no change handler. */
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
