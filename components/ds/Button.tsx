import React from "react";
import pixel from "./pixel.module.css";
import styles from "./Button.module.css";
import { cx } from "./cx";

export type ButtonIntent = "default" | "primary" | "success" | "warning" | "error";
export type ButtonSize = "sm" | "md";

export interface ButtonProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
    intent?: ButtonIntent;
    size?: ButtonSize;
    /** Escape hatch for layout only — spacing and visibility, never colour. */
    className?: string;
}

/**
 * The one button.
 *
 * `type` defaults to "button", not HTML's "submit": otherwise every button
 * inside the landing form submits it as a side effect. Callers that want a
 * submit say so — see DialogClose, which is exactly that.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { intent = "default", size = "md", className, type = "button", ...rest },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            className={cx(
                pixel.notched,
                pixel.control,
                styles.button,
                styles[intent],
                styles[size],
                className,
            )}
            {...rest}
        />
    );
});

export default Button;
