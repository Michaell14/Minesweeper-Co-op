import React from "react";
import styles from "./Slider.module.css";
import { cx } from "./cx";

export interface SliderProps {
    /** Current value, in [min, max]. */
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    /** Required — the slider renders no visible text of its own. */
    "aria-label": string;
    className?: string;
    disabled?: boolean;
}

/**
 * A restyled native range input: keyboard, drag and screen-reader behaviour
 * come from the browser, only the paint is ours. Anything continuous-valued uses this.
 */
export default function Slider({
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    className,
    disabled,
    ...aria
}: SliderProps) {
    return (
        <input
            type="range"
            className={cx(styles.slider, className)}
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={aria["aria-label"]}
        />
    );
}
