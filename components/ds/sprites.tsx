"use client";

import React from "react";
import { rectsOf, type PixelArt } from "./pixelArt";
import { cx } from "./cx";
import { subscribeAppliedTheme, getAppliedTheme } from "@/lib/theme";
import styles from "./sprites.module.css";
import { SPRITE_SETS, DEFAULT_SET, spriteSetById, type SpriteKind } from "./spriteArt";

// Re-exported so callers need one path.
export * from "./spriteArt";

/** The art as <rect> runs. Callers wrap it in their own <svg> or <symbol>. */
export const PixelRects = ({ art }: { art: PixelArt }) => (
    <>
        {rectsOf(art).map(({ x, y, w, fill }, i) => (
            <rect key={i} x={x} y={y} width={w} height={1} fill={fill} />
        ))}
    </>
);

const SYMBOL_ID: Record<SpriteKind, string> = {
    mine: "ms-sprite-mine",
    flag: "ms-sprite-flag",
};

/**
 * The applied palette, read off `<html data-theme>` rather than the store: the
 * no-flash script, the settings slice and /ds all set it, and only the
 * attribute knows all three.
 */
function useAppliedTheme(): string | null {
    return React.useSyncExternalStore(subscribeAppliedTheme, getAppliedTheme, () => null);
}

/**
 * The two symbols every <Sprite> points at, mounted once in the layout. A mine
 * is ~40 rects, so inlining per cell would put thousands of nodes on a lost
 * board; <use> is live, so a palette swap redraws every flag without React.
 *
 * `pinned` is a general set id (settings.spriteSet, via SpriteDefsHost.tsx).
 * A seasonal pair wins while its window paints and the pin resumes after;
 * an unknown id falls back to following, never to blank art.
 */
export function SpriteDefs({ pinned }: { pinned?: string | null } = {}) {
    const applied = useAppliedTheme();
    const seasonal = applied ? SPRITE_SETS[applied] : undefined;
    const set = seasonal ?? spriteSetById(pinned) ?? DEFAULT_SET;
    return (
        <svg className={styles.defs} aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
            <symbol id={SYMBOL_ID.mine} viewBox="0 0 16 16">
                <PixelRects art={set.mine} />
            </symbol>
            <symbol id={SYMBOL_ID.flag} viewBox="0 0 16 16">
                <PixelRects art={set.flag} />
            </symbol>
        </svg>
    );
}

export interface SpriteProps {
    kind: SpriteKind;
    /** Without one it takes the inline size, for use beside text. */
    className?: string;
}

/** A mine or a flag. Decorative; callers carry the accessible name. */
export default function Sprite({ kind, className }: SpriteProps) {
    return (
        <svg
            className={cx(styles.sprite, className ?? styles.inline)}
            viewBox="0 0 16 16"
            shapeRendering="crispEdges"
            aria-hidden="true"
            focusable="false"
        >
            <use href={`#${SYMBOL_ID[kind]}`} />
        </svg>
    );
}
