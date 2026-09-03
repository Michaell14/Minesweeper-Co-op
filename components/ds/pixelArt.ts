/**
 * Pixel art stored as the art itself: a character grid plus a palette; a
 * space is transparent. Shared by icons.tsx and sprites.tsx.
 */

export type PixelArt = {
    readonly palette: Readonly<Record<string, string>>;
    readonly rows: readonly string[];
};

export type Rect = { x: number; y: number; w: number; fill: string };

/**
 * Flatten art into horizontal runs of same-coloured pixels — 252 pixels become
 * 52 rects for the GitHub mark. Runs at module load, not per render.
 */
export function toRects({ palette, rows }: PixelArt): Rect[] {
    const rects: Rect[] = [];
    rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            const glyph = row[x];
            if (glyph === " ") { x++; continue; }
            let w = 1;
            while (row[x + w] === glyph) w++;
            rects.push({ x, y, w, fill: palette[glyph] });
            x += w;
        }
    });
    return rects;
}

const cache = new WeakMap<PixelArt, Rect[]>();

/**
 * The rects for a piece of art, flattened once per art object however often
 * it is drawn. Every renderer goes through this rather than deciding itself.
 */
export function rectsOf(art: PixelArt): Rect[] {
    let rects = cache.get(art);
    if (!rects) {
        rects = toRects(art);
        cache.set(art, rects);
    }
    return rects;
}
