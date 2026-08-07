"use client";

import React from "react";
import { rectsOf, type PixelArt } from "./pixelArt";
import { cx } from "./cx";
import { subscribeAppliedTheme, getAppliedTheme } from "@/lib/theme";
import styles from "./sprites.module.css";

/**
 * The mine and the flag, drawn the same way as the icons: a 16x16 grid of
 * characters and a palette (see pixelArt.ts). Every seasonal palette brings its
 * own pair.
 *
 * The DEFAULT pair paints in token colours, because it has to read on twelve
 * palettes at once — the bomb takes `--ms-cell-open`, the one colour the token
 * suite guarantees against the mine fill it sits on, and the flagpole takes the
 * page ink. A literal black bomb disappears on Game Boy, whose mine cell is the
 * darkest green it has.
 *
 * A SEASONAL pair paints in literal hex, because it only ever appears on its
 * own palette and those colours are the point — pumpkin orange is not derivable
 * from anything.
 */

export interface SpriteSet {
    mine: PixelArt;
    flag: PixelArt;
}

const DEFAULT_MINE: PixelArt = {
    /*
     * Two tokens, and both are load-bearing. The body is the page ink and the
     * outline is the opened-cell fill, so on Game Boy — where the ink and the
     * mine cell are the same darkest green — the bomb still reads as a bright
     * ring, and on every other palette it is a dark bomb with a light edge.
     */
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "           oo   ",
        "          oo    ",
        "     oooooo     ",
        "   oo######oo   ",
        "  o##########o  ",
        "  o###oo#####o  ",
        " o####o#######o ",
        " o############o ",
        " o############o ",
        " o############o ",
        "  o##########o  ",
        "  o##########o  ",
        "   oo######oo   ",
        "     oooooo     ",
        "                ",
    ],
};

const DEFAULT_FLAG: PixelArt = {
    /*
     * Outlined for the same reason the bomb is: the cloth is the mine colour and
     * the closed cell it sits on is a mid neutral, which on the default palette
     * is 1.3:1 — a shape you can see only because you know it is there. The ink
     * edge carries the silhouette; the fill just says which flag it is.
     */
    palette: {
        R: "var(--ms-cell-mine)",
        P: "var(--ms-ink-strong)",
    },
    rows: [
        "                ",
        " RRRRRRRPP      ",
        " RRRRRRRPP      ",
        "  RRRRRRPP      ",
        "   RRRRRPP      ",
        "    RRRRPP      ",
        "     RRRPP      ",
        "      RRPP      ",
        "       RPP      ",
        "        PP      ",
        "        PP      ",
        "        PP      ",
        "      PPPPPP    ",
        "    PPPPPPPPPP  ",
        "                ",
        "                ",
    ],
};

/* Halloween — a ghost under the lid, a lit pumpkin as the marker. */
const HALLOWEEN_MINE: PixelArt = {
    palette: { w: "#f6ead6", "#": "#150f1f" },
    rows: [
        "                ",
        "     wwwwww     ",
        "    wwwwwwww    ",
        "   wwwwwwwwww   ",
        "   ww##ww##ww   ",
        "   ww##ww##ww   ",
        "   wwwwwwwwww   ",
        "   wwwwwwwwww   ",
        "   www####www   ",
        "   wwwwwwwwww   ",
        "   wwwwwwwwww   ",
        "   wwwwwwwwww   ",
        "   wwwwwwwwww   ",
        "   ww  ww  ww   ",
        "                ",
        "                ",
    ],
};

const HALLOWEEN_FLAG: PixelArt = {
    palette: { o: "#ff7a18", "#": "#150f1f", g: "#86e01e" },
    rows: [
        "                ",
        "                ",
        "       gg       ",
        "      gg        ",
        "   oooooooooo   ",
        "  oooooooooooo  ",
        "  oo##oooo##oo  ",
        "  oo##oooo##oo  ",
        "  oooooooooooo  ",
        "  oo########oo  ",
        "  oooo####oooo  ",
        "  oooooooooooo  ",
        "   oooooooooo   ",
        "    oooooooo    ",
        "                ",
        "                ",
    ],
};

/* Christmas — a present nobody wanted, a fir tree as the marker. */
const CHRISTMAS_MINE: PixelArt = {
    palette: { w: "#f2f7f5", g: "#14653a" },
    rows: [
        "                ",
        "                ",
        "    gg    gg    ",
        "   gggg  gggg   ",
        "    gggggggg    ",
        " wwwwwwggwwwwww ",
        " wwwwwwggwwwwww ",
        "  wwwwwggwwwww  ",
        "  wwwwwggwwwww  ",
        "  wwwwwggwwwww  ",
        "  wwwwwggwwwww  ",
        "  wwwwwggwwwww  ",
        "  wwwwwggwwwww  ",
        "  wwwwwggwwwww  ",
        "                ",
        "                ",
    ],
};

const CHRISTMAS_FLAG: PixelArt = {
    palette: { g: "#14653a", y: "#d99a00", b: "#6b4423" },
    rows: [
        "                ",
        "       yy       ",
        "       gg       ",
        "      gggg      ",
        "     gggggg     ",
        "      gggg      ",
        "     gggggg     ",
        "    gggggggg    ",
        "     gggggg     ",
        "    gggggggg    ",
        "   gggggggggg   ",
        "  gggggggggggg  ",
        "       bb       ",
        "      bbbb      ",
        "                ",
        "                ",
    ],
};

/* Lunar New Year — a firecracker with the fuse lit, a lantern as the marker. */
const LUNAR_NEW_YEAR_MINE: PixelArt = {
    palette: { R: "#5c1e1a", y: "#f5b52a", f: "#2a0a0a", s: "#ffe9c4" },
    rows: [
        "            ss  ",
        "           s    ",
        "          f     ",
        "         f      ",
        "    RRRRRRRR    ",
        "    RRRRRRRR    ",
        "    yyyyyyyy    ",
        "    RRRRRRRR    ",
        "    RRRRRRRR    ",
        "    RRRRRRRR    ",
        "    yyyyyyyy    ",
        "    RRRRRRRR    ",
        "    RRRRRRRR    ",
        "    RRRRRRRR    ",
        "                ",
        "                ",
    ],
};

const LUNAR_NEW_YEAR_FLAG: PixelArt = {
    palette: { R: "#ff5c47", y: "#f5b52a" },
    rows: [
        "                ",
        "     yyyyyy     ",
        "    RRRRRRRR    ",
        "   RRRRRRRRRR   ",
        "  RRRRRRRRRRRR  ",
        "  RRRRRRRRRRRR  ",
        "  RRRRRRRRRRRR  ",
        "  RRRRRRRRRRRR  ",
        "   RRRRRRRRRR   ",
        "    RRRRRRRR    ",
        "     yyyyyy     ",
        "       yy       ",
        "       yy       ",
        "      yyyy      ",
        "                ",
        "                ",
    ],
};

/* Valentine's — a heart that broke, a rose as the marker. */
const VALENTINES_MINE: PixelArt = {
    palette: { R: "#3d1029", p: "#fff0f4" },
    rows: [
        "                ",
        "                ",
        "   RRR    RRR   ",
        "  RppRR  RRRRR  ",
        " RppRRR RRRRRRR ",
        " RRRRRRR RRRRRR ",
        " RRRRRR RRRRRRR ",
        "  RRRRRR RRRRR  ",
        "   RRRR RRRRR   ",
        "    RRRR RRR    ",
        "     RRR RR     ",
        "      RR R      ",
        "       R        ",
        "                ",
        "                ",
        "                ",
    ],
};

const VALENTINES_FLAG: PixelArt = {
    palette: { R: "#8c1240", d: "#c2185b", g: "#2f7a52" },
    rows: [
        "                ",
        "                ",
        "     RRRRRR     ",
        "    RRRRRRRR    ",
        "   RRRddddRRR   ",
        "   RRdRRRRdRR   ",
        "   RRdRRRRdRR   ",
        "    RRddddRR    ",
        "     RRRRRR     ",
        "       gg       ",
        "    ggggg       ",
        "       gg       ",
        "       ggggg    ",
        "       gg       ",
        "                ",
        "                ",
    ],
};

/* Thanksgiving — a slice of pie, a maple leaf as the marker. */
const THANKSGIVING_MINE: PixelArt = {
    palette: { f: "#d98f00", t: "#fbeed8", w: "#fdf3e3" },
    rows: [
        "                ",
        "                ",
        "       ww       ",
        "      wwww      ",
        "      ffff      ",
        "     ffffff     ",
        "    ffffffff    ",
        "   ffffffffff   ",
        "  ffffffffffff  ",
        "  tttttttttttt  ",
        "  tttttttttttt  ",
        "   tttttttttt   ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

const THANKSGIVING_FLAG: PixelArt = {
    palette: { o: "#b3441a", b: "#6b4423" },
    rows: [
        "                ",
        "       oo       ",
        "   o  oooo  o   ",
        "   oo oooo oo   ",
        "    oooooooo    ",
        " oooooooooooooo ",
        "  oooooooooooo  ",
        "   oooooooooo   ",
        "    oooooooo    ",
        "   oooooooooo   ",
        "      oooo      ",
        "       oo       ",
        "       bb       ",
        "       bb       ",
        "                ",
        "                ",
    ],
};

/* St Patrick's — the hat, a shamrock as the marker. */
const STPATRICKS_MINE: PixelArt = {
    palette: { g: "#10240a", k: "#0a1206", y: "#c8940a" },
    rows: [
        "                ",
        "                ",
        "     gggggg     ",
        "     gggggg     ",
        "     gggggg     ",
        "     gggggg     ",
        "     gggggg     ",
        "    kkkkkkkk    ",
        "    kkkyykkk    ",
        "  gggggggggggg  ",
        " gggggggggggggg ",
        "  gggggggggggg  ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

const STPATRICKS_FLAG: PixelArt = {
    palette: { g: "#2a7a40" },
    rows: [
        "                ",
        "                ",
        "      gggg      ",
        "     gggggg     ",
        "     gggggg     ",
        "  gggggggggggg  ",
        " gggggggggggggg ",
        " gggggggggggggg ",
        "  gggggggggggg  ",
        "      gggg      ",
        "       gg       ",
        "       gg       ",
        "      gg        ",
        "     gg         ",
        "                ",
        "                ",
    ],
};

/* Pride — a rainbow heart, the flag itself as the marker. */
const PRIDE_MINE: PixelArt = {
    palette: {
        "#": "#1a1523",
        r: "#e40303",
        o: "#ff8c00",
        y: "#ffed00",
        g: "#008026",
        b: "#24408e",
        v: "#732982",
    },
    rows: [
        "                ",
        "   ####  ####   ",
        "  #rrrr##rrrr#  ",
        " #rrrrrrrrrrrr# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #yyyyyyyyyyyy# ",
        "  #yyyyyyyyyy#  ",
        "  #gggggggggg#  ",
        "   #gggggggg#   ",
        "    #bbbbbb#    ",
        "     #bbbb#     ",
        "      #vv#      ",
        "       ##       ",
        "                ",
        "                ",
    ],
};

const PRIDE_FLAG: PixelArt = {
    palette: {
        P: "#1a1523",
        r: "#e40303",
        o: "#ff8c00",
        y: "#ffed00",
        g: "#008026",
        b: "#24408e",
        v: "#732982",
    },
    rows: [
        "                ",
        "                ",
        "  PPrrrrrrrrrr  ",
        "  PPrrrrrrrrrr  ",
        "  PPoooooooooo  ",
        "  PPoooooooooo  ",
        "  PPyyyyyyyyyy  ",
        "  PPyyyyyyyyyy  ",
        "  PPgggggggggg  ",
        "  PPgggggggggg  ",
        "  PPbbbbbbbbbb  ",
        "  PPbbbbbbbbbb  ",
        "  PPvvvvvvvvvv  ",
        "  PPvvvvvvvvvv  ",
        "  PP            ",
        "                ",
    ],
};

/* Día de Muertos — a calavera, a marigold as the marker. */
const DAY_OF_THE_DEAD_MINE: PixelArt = {
    palette: { w: "#fdf0d5", "#": "#170c22" },
    rows: [
        "                ",
        "                ",
        "    wwwwwwww    ",
        "   wwwwwwwwww   ",
        "  wwwwwwwwwwww  ",
        "  ww##wwww##ww  ",
        "  ww##wwww##ww  ",
        "  wwwwwwwwwwww  ",
        "  wwwww##wwwww  ",
        "  wwwwwwwwwwww  ",
        "   wwwwwwwwww   ",
        "    wwwwwwww    ",
        "    w#w#w#w#    ",
        "     wwwwww     ",
        "                ",
        "                ",
    ],
};

const DAY_OF_THE_DEAD_FLAG: PixelArt = {
    palette: { o: "#ff9f1c", y: "#ffd23f", g: "#5fd67f" },
    rows: [
        "                ",
        "                ",
        "    o  oo  o    ",
        "   oooooooooo   ",
        "  oooooooooooo  ",
        "  ooooyyyyoooo  ",
        " oooyyyyyyyyooo ",
        " oooyyyyyyyyooo ",
        "  ooooyyyyoooo  ",
        "  oooooooooooo  ",
        "   oooooooooo   ",
        "    o  oo  o    ",
        "       gg       ",
        "       gg       ",
        "                ",
        "                ",
    ],
};

/* New Year — a firework going off, a raised glass as the marker. */
const NEWYEAR_MINE: PixelArt = {
    palette: { "#": "#0b0d1a", y: "#ffd35c" },
    rows: [
        "                ",
        "       ##       ",
        "  #    ##    #  ",
        "   #   ##   #   ",
        "    #  ##  #    ",
        "     # ## #     ",
        "      ####      ",
        " ######yy###### ",
        " ######yy###### ",
        "      ####      ",
        "     # ## #     ",
        "    #  ##  #    ",
        "   #   ##   #   ",
        "  #    ##    #  ",
        "       ##       ",
        "                ",
    ],
};

const NEWYEAR_FLAG: PixelArt = {
    palette: { w: "#f5efd8", y: "#ffb340" },
    rows: [
        "                ",
        "     w   w      ",
        "    yyyyyyyy    ",
        "    yyyyyyyy    ",
        "     wwwwww     ",
        "      wwww      ",
        "       ww       ",
        "       ww       ",
        "       ww       ",
        "       ww       ",
        "       ww       ",
        "     wwwwww     ",
        "    wwwwwwww    ",
        "                ",
        "                ",
        "                ",
    ],
};

/** Keyed by `data-theme`; DEFAULT covers every palette without a pair. */
export const DEFAULT_SET: SpriteSet = { mine: DEFAULT_MINE, flag: DEFAULT_FLAG };

export const SPRITE_SETS: Readonly<Record<string, SpriteSet>> = {
    halloween: { mine: HALLOWEEN_MINE, flag: HALLOWEEN_FLAG },
    christmas: { mine: CHRISTMAS_MINE, flag: CHRISTMAS_FLAG },
    "lunar-new-year": { mine: LUNAR_NEW_YEAR_MINE, flag: LUNAR_NEW_YEAR_FLAG },
    valentines: { mine: VALENTINES_MINE, flag: VALENTINES_FLAG },
    thanksgiving: { mine: THANKSGIVING_MINE, flag: THANKSGIVING_FLAG },
    stpatricks: { mine: STPATRICKS_MINE, flag: STPATRICKS_FLAG },
    pride: { mine: PRIDE_MINE, flag: PRIDE_FLAG },
    "day-of-the-dead": { mine: DAY_OF_THE_DEAD_MINE, flag: DAY_OF_THE_DEAD_FLAG },
    newyear: { mine: NEWYEAR_MINE, flag: NEWYEAR_FLAG },
};

export type SpriteKind = "mine" | "flag";

/** The pair a palette paints. */
export const spriteSetFor = (theme: string | null): SpriteSet =>
    (theme && SPRITE_SETS[theme]) || DEFAULT_SET;

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
 */
export function SpriteDefs() {
    const set = spriteSetFor(useAppliedTheme());
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
