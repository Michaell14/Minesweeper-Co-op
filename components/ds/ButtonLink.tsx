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
 * A Button that is actually a link.
 *
 * Wears exactly Button's classes, so the two stay identical by construction
 * rather than by remembering to update both.
 *
 * Use this whenever the control NAVIGATES. A `<button>` with a router push looks
 * the same and loses everything an href carries: middle-click and cmd-click, the
 * status bar preview, "open in new tab", and — the reason this exists — being a
 * crawlable link at all. Wrapping a Button in a Link instead nests a button
 * inside an anchor, which is invalid and announces as both.
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
