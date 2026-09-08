import React from "react";
import Link from "next/link";
import pixel from "./pixel.module.css";
import styles from "./Button.module.css";
import { cx } from "./cx";
import type { ButtonIntent, ButtonSize } from "./Button";

export interface ButtonLinkProps
    extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> {
    href: string;
    intent?: ButtonIntent;
    size?: ButtonSize;
    /** Escape hatch for layout only — spacing and visibility, never colour. */
    className?: string;
}

/**
 * A Button that is actually a link. Wears exactly Button's classes, so the two
 * stay identical by construction. Use it whenever the control NAVIGATES: a
 * `<button>` with a router push loses middle-click, the status bar preview and
 * crawlability, and wrapping a Button in a Link nests a button in an anchor.
 */
export default function ButtonLink({
    href,
    intent = "default",
    size = "md",
    className,
    ...rest
}: ButtonLinkProps) {
    return (
        <Link
            href={href}
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
}
