import React from "react";
import { rectsOf } from "./pixelArt";
import { avatarArtById } from "./avatarArt";

export interface AvatarProps {
    /** A catalog id from shared/avatars.js; unknown/null falls back to the default. */
    id: string | null | undefined;
    size?: number;
    className?: string;
}

/**
 * A profile picture. Inline rects rather than the sprite <symbol>/<use>
 * indirection: avatars appear a handful at a time, never 512 in a board, so
 * the cheapness machinery would buy nothing. Colours are tokens, so it repaints
 * with the palette like everything else.
 *
 * Decorative — callers carry the accessible name, same contract as <Sprite>.
 */
export default function Avatar({ id, size = 32, className }: AvatarProps) {
    return (
        <svg
            viewBox="0 0 16 16"
            width={size}
            height={size}
            shapeRendering="crispEdges"
            aria-hidden="true"
            focusable="false"
            className={className}
        >
            {rectsOf(avatarArtById(id)).map(({ x, y, w, fill }, i) => (
                <rect key={i} x={x} y={y} width={w} height={1} fill={fill} />
            ))}
        </svg>
    );
}
