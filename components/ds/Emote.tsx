import React from "react";
import { rectsOf } from "./pixelArt";
import { emoteArtById } from "./emoteArt";

export interface EmoteProps {
    /** A catalog id from shared/emotes.js. An unknown id draws nothing. */
    id: string | null | undefined;
    size?: number;
    className?: string;
}

/**
 * One emote glyph. Inline rects like <Avatar>, not the sprite <symbol>/<use>
 * indirection: a handful are on screen at once, never 512. Colours are
 * tokens. Decorative: callers carry the accessible name, as with <Sprite> and
 * <Avatar>. Renders nothing for an id this build cannot draw.
 */
export default function Emote({ id, size = 28, className }: EmoteProps) {
    const art = emoteArtById(id);
    if (!art) return null;

    return (
        <svg
            viewBox="0 0 16 16"
            width={size}
            height={size}
            shapeRendering="crispEdges"
            aria-hidden="true"
            focusable="false"
            className={className}
            // Which glyph drew, for tests and tooling (the cells' data-sprite pattern).
            data-emote={id}
        >
            {rectsOf(art).map(({ x, y, w, fill }, i) => (
                <rect key={i} x={x} y={y} width={w} height={1} fill={fill} />
            ))}
        </svg>
    );
}
