import React from "react";
import pixel from "./pixel.module.css";
import styles from "./Input.module.css";
import { cx } from "./cx";

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "size"> {
    size?: "sm" | "md";
    /** Reddens the outline. Pair with <Field errorText> for the message. */
    invalid?: boolean;
    className?: string;
}

/** Text input. Forwards its ref, which react-hook-form's `register()` needs. */
const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
    { size = "md", invalid, className, ...rest },
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
                invalid && styles.invalid,
                className,
            )}
            {...rest}
        />
    );
});

export default Input;
