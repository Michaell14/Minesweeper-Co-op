"use client";

import React from "react";
import { rectsOf, type PixelArt } from "./pixelArt";
import { cx } from "./cx";
import { subscribeAppliedTheme, getAppliedTheme } from "@/lib/theme";
import styles from "./sprites.module.css";
import { SPRITE_SETS, DEFAULT_SET, spriteSetById, type SpriteKind } from "./spriteArt";

// The art lives in spriteArt.ts, re-exported here so callers need one path.
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
 * The applied palette, read off `<html data-theme>` rather than from the store.
 *
 * The attribute is the only thing that knows the whole truth: the no-flash
 * script sets it before any bundle runs, the settings slice sets it when a
 * holiday is in season, and /ds sets it directly to preview a palette. A store
 * subscription would miss the last of those and duplicate the first two.
 */
function useAppliedTheme(): string | null {
    return React.useSyncExternalStore(subscribeAppliedTheme, getAppliedTheme, () => null);
}

/**
 * The two symbols every <Sprite> points at, mounted once in the layout.
 *
 * The indirection is what keeps the board cheap: a 16x16 mine is ~40 rects, and
 * inlining that in every cell would put thousands of nodes on a lost board.
 * <use> is a live reference, so swapping the palette redraws every flag on the
 * board without React re-rendering a single cell.
 *
 * `pinned` is a GENERAL set id the player chose (settings.spriteSet, wired up
 * by components/SpriteDefsHost.tsx). Precedence mirrors the palette's own
 * rule: while a holiday window paints, its pair wins — it is paint, and it
 * leaves on its own — and the pin resumes afterwards. Seasonal ids are not
 * pinnable, and an unknown id falls back to following, never to blank art.
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
    /** Sizes it. Without one it takes the inline size, for use beside text. */
    className?: string;
}

/** A mine or a flag. Decorative — callers carry the accessible name. */
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
