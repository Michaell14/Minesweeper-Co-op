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
 * indirection: a handful are on screen at once, never 512, so the cheapness
 * machinery would buy nothing. Colours are tokens, so it repaints with the
 * palette.
 *
 * Decorative — callers carry the accessible name, same contract as <Sprite>
 * and <Avatar>. Renders nothing at all for an id this build cannot draw, which
 * is what `emoteArtById` returning null is for.
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
            // Which glyph actually drew — the board cells' data-sprite pattern.
            // The art is otherwise indistinguishable to tests and tooling.
            data-emote={id}
        >
            {rectsOf(art).map(({ x, y, w, fill }, i) => (
                <rect key={i} x={x} y={y} width={w} height={1} fill={fill} />
            ))}
        </svg>
    );
}
