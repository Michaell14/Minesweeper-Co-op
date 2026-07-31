import React from "react";
import pixel from "./pixel.module.css";
import styles from "./Input.module.css";
import { cx } from "./cx";

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "size"> {
    size?: "sm" | "md";
    /** Drives the outline colour. Pair with <Field errorText> for the message. */
    validity?: "invalid" | "valid";
    className?: string;
}

/**
 * Text input.
 *
 * Forwards its ref, which react-hook-form's `register()` needs — the previous
 * raw <input className="nes-input"> worked only because register's props were
 * spread directly onto a DOM node.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
    { size = "md", validity, className, ...rest },
    ref,
) {
    return (
        <input
            ref={ref}
            className={cx(
                pixel.notched,
                pixel.control,
                styles.input,
                styles[size],
                validity && styles[validity],
                className,
            )}
            {...rest}
        />
    );
});

export default Input;
