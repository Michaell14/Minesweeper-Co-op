import React from "react";
import { rectsOf } from "./pixelArt";
import { avatarArtById, avatarFramesById, resolvedAvatarId } from "./avatarArt";
import { cx } from "./cx";
import styles from "./Avatar.module.css";

export interface AvatarProps {
    /** A catalog id from shared/avatars.js; unknown/null falls back to the default. */
    id: string | null | undefined;
    size?: number;
    className?: string;
    /**
     * Play the avatar's hover animation when pointed at, for the avatars that
     * have one. Opt-in: a score table where every row twitches under the cursor
     * is noise, and at 20px a one-pixel move is jitter rather than motion.
     */
    animated?: boolean;
}

/**
 * A profile picture. Inline rects rather than the sprite <symbol>/<use>
 * indirection: avatars appear a handful at a time, never 512 in a board, so
 * the cheapness machinery would buy nothing. Colours are tokens, so it repaints
 * with the palette like everything else.
 *
 * Decorative — callers carry the accessible name, same contract as <Sprite>.
 */
export default function Avatar({ id, size = 32, className, animated = false }: AvatarProps) {
    // Every frame is in the DOM whether or not it animates; only the base one
    // is visible until hover, and CSS cannot add the rest at that point.
    const frames = animated ? avatarFramesById(id) : [avatarArtById(id)];

    return (
        <svg
            viewBox="0 0 16 16"
            width={size}
            height={size}
            shapeRendering="crispEdges"
            aria-hidden="true"
            focusable="false"
            className={cx(className, animated && styles.animated)}
            // Which face actually drew — the board cells' data-sprite pattern.
            // The art is otherwise indistinguishable to tests and tooling.
            // Also what the hover keyframes key off, so the timing can differ
            // per avatar without a class per avatar.
            data-avatar={resolvedAvatarId(id)}
        >
            {frames.map((art, frame) => (
                <g key={frame} className={styles.frame}>
                    {rectsOf(art).map(({ x, y, w, fill }, i) => (
                        <rect key={i} x={x} y={y} width={w} height={1} fill={fill} />
                    ))}
                </g>
            ))}
        </svg>
    );
}
