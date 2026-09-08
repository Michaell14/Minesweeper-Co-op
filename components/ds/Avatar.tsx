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
    /** Opt-in hover animation: a score table of twitching rows is noise, and at 20px it is jitter. */
    animated?: boolean;
}

/**
 * A profile picture. Inline rects, not the sprite <symbol>/<use> indirection:
 * avatars appear a handful at a time, never 512 in a board. Colours are
 * tokens. Decorative; callers carry the accessible name, as with <Sprite>.
 */
export default function Avatar({ id, size = 32, className, animated = false }: AvatarProps) {
    // Every frame is in the DOM: CSS cannot add the rest on hover.
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
            // Which face drew, for tests and tooling; the hover keyframes key off it too.
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
