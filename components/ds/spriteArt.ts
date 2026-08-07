/* The art itself, in a PURE module: no React, no CSS import — importable from
 * lib/ without dragging either into its graph. The React side (PixelRects,
 * SpriteDefs, Sprite) is sprites.tsx.
 */
import { type PixelArt } from "./pixelArt";

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

/*
 * GENERAL sets — pinnable from Settings any day of the year, so unlike the
 * seasonal pairs they paint in TOKENS: a pinned pair sits on whichever palette
 * the player runs, and a literal colour would vanish on one of them the same
 * way a black bomb does on Game Boy.
 */

/* Naval — a contact mine with horns, an anchor as the marker. */
const NAVAL_MINE: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "       oo       ",
        "       oo       ",
        "     oooooo     ",
        "    o######o    ",
        "   o###oo###o   ",
        "   o##o#####o   ",
        " ooo########ooo ",
        " ooo########ooo ",
        "   o########o   ",
        "   o########o   ",
        "    o######o    ",
        "     oooooo     ",
        "       oo       ",
        "       oo       ",
        "                ",
    ],
};

const NAVAL_FLAG: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
    },
    rows: [
        "                ",
        "      ####      ",
        "     ##  ##     ",
        "     ##  ##     ",
        "      ####      ",
        "       ##       ",
        "    ########    ",
        "       ##       ",
        "       ##       ",
        "  ##   ##   ##  ",
        "  ##   ##   ##  ",
        "  ##   ##   ##  ",
        "  ###  ##  ###  ",
        "   ##########   ",
        "    ########    ",
        "                ",
    ],
};

/* Space — a saucer keeping its distance, a rocket as the marker. */
const SPACE_MINE: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "                ",
        "      oooo      ",
        "     o####o     ",
        "     o####o     ",
        "   oooooooooo   ",
        "  o##########o  ",
        " o#o##o##o##o#o ",
        "  o##########o  ",
        "   oooooooooo   ",
        "    o      o    ",
        "   o        o   ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

const SPACE_FLAG: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
        R: "var(--ms-cell-mine)",
    },
    rows: [
        "                ",
        "       ##       ",
        "      ####      ",
        "     ######     ",
        "     ######     ",
        "     ##oo##     ",
        "     ##oo##     ",
        "     ######     ",
        "     ######     ",
        "    ########    ",
        "   ##########   ",
        "   ##  ##  ##   ",
        "       RR       ",
        "      RRRR      ",
        "       RR       ",
        "                ",
    ],
};

/* Kitty — the cat that found the mine, a fish as the marker. */
const KITTY_MINE: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "                ",
        "   oo      oo   ",
        "   ooo    ooo   ",
        "   oooooooooo   ",
        "  oooooooooooo  ",
        "  oo##oooo##oo  ",
        "  oo##oooo##oo  ",
        "  oooooooooooo  ",
        " #ooooo##ooooo# ",
        "  ooo##oo##ooo  ",
        "  oooooooooooo  ",
        "   oooooooooo   ",
        "                ",
        "                ",
        "                ",
    ],
};

const KITTY_FLAG: PixelArt = {
    palette: {
        R: "var(--ms-cell-mine)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "                ",
        "                ",
        "                ",
        "    RRRRRR      ",
        "  RRRRRRRRRR RR ",
        " RRoRRRRRRRRRRR ",
        " RRRRRRRRRRRRR  ",
        "  RRRRRRRRRR RR ",
        "    RRRRRR      ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

/* Straw Hat — a pirate skull under the hat, the hat itself as the marker. */
const STRAWHAT_MINE: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "      oooo      ",
        "     oooooo     ",
        "     o####o     ",
        " oooooooooooooo ",
        "   oooooooooo   ",
        "  oooooooooooo  ",
        "  oo##oooo##oo  ",
        "  oo##oooo##oo  ",
        "  oooooooooooo  ",
        "   oooo##oooo   ",
        "   oooooooooo   ",
        "    oo#oo#oo    ",
        "    oooooooo    ",
        "                ",
        "                ",
    ],
};

const STRAWHAT_FLAG: PixelArt = {
    palette: {
        R: "var(--ms-cell-mine)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "      oooo      ",
        "     oooooo     ",
        "     oooooo     ",
        "    RRRRRRRR    ",
        " oooooooooooooo ",
        "  oooooooooooo  ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

/* Shinobi — a thrown shuriken, a kunai planted point-down as the marker. */
const SHINOBI_MINE: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        " oo          oo ",
        " ooo        ooo ",
        "  ooo      ooo  ",
        "   ooo    ooo   ",
        "    ooo  ooo    ",
        "     oooooo     ",
        "      o##o      ",
        "      o##o      ",
        "     oooooo     ",
        "    ooo  ooo    ",
        "   ooo    ooo   ",
        "  ooo      ooo  ",
        " ooo        ooo ",
        " oo          oo ",
        "                ",
    ],
};

const SHINOBI_FLAG: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "      ####      ",
        "      #  #      ",
        "      ####      ",
        "       ##       ",
        "       ##       ",
        "      ####      ",
        "    oooooooo    ",
        "    oooooooo    ",
        "     oooooo     ",
        "     oooooo     ",
        "      oooo      ",
        "      oooo      ",
        "       oo       ",
        "       oo       ",
        "                ",
    ],
};

/* Puppy — floppy ears and a big nose, a bone as the marker. */
const PUPPY_MINE: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "                ",
        "   oooooooooo   ",
        "  oooooooooooo  ",
        " oo oooooooo oo ",
        " oo oooooooo oo ",
        " oo o##oo##o oo ",
        " oo oooooooo oo ",
        "    oooooooo    ",
        "    oo####oo    ",
        "    oooooooo    ",
        "     oooooo     ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

const PUPPY_FLAG: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
        "  ###      ###  ",
        " #ooo######ooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #ooo######ooo# ",
        "  ###      ###  ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

/* Robot — a head that ticks, a lightning bolt as the marker. */
const ROBOT_MINE: PixelArt = {
    palette: {
        "#": "var(--ms-ink-strong)",
        o: "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "      oooo      ",
        "       oo       ",
        "   oooooooooo   ",
        "  o##########o  ",
        "  o##########o  ",
        "  o#oo####oo#o  ",
        "  o#oo####oo#o  ",
        "  o##########o  ",
        "  o##oooooo##o  ",
        "  o##########o  ",
        "   oooooooooo   ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

const ROBOT_FLAG: PixelArt = {
    palette: {
        R: "var(--ms-cell-mine)",
    },
    rows: [
        "                ",
        "                ",
        "      RRRRR     ",
        "     RRRRR      ",
        "    RRRRR       ",
        "   RRRRRR       ",
        "   RRRRRRRR     ",
        "      RRRRR     ",
        "     RRRR       ",
        "    RRRR        ",
        "   RRRR         ",
        "  RRR           ",
        "  RR            ",
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

/**
 * The general sets, with their picker labels. Deliberately separate from
 * SPRITE_SETS: only these are pinnable — the seasonal pairs arrive with their
 * holiday and are not offered, which is why spriteSetById below never looks
 * in the seasonal table.
 */
export const GENERAL_SPRITE_SETS: ReadonlyArray<{ id: string; label: string; set: SpriteSet }> = [
    { id: "naval", label: "Naval", set: { mine: NAVAL_MINE, flag: NAVAL_FLAG } },
    { id: "space", label: "Space", set: { mine: SPACE_MINE, flag: SPACE_FLAG } },
    { id: "kitty", label: "Kitty", set: { mine: KITTY_MINE, flag: KITTY_FLAG } },
    { id: "strawhat", label: "Straw Hat", set: { mine: STRAWHAT_MINE, flag: STRAWHAT_FLAG } },
    { id: "shinobi", label: "Shinobi", set: { mine: SHINOBI_MINE, flag: SHINOBI_FLAG } },
    { id: "puppy", label: "Puppy", set: { mine: PUPPY_MINE, flag: PUPPY_FLAG } },
    { id: "robot", label: "Robot", set: { mine: ROBOT_MINE, flag: ROBOT_FLAG } },
];

/** Every pinnable set id — "classic" names the default pair. No seasonal ids. */
export const SPRITE_SET_IDS: string[] = ["classic", ...GENERAL_SPRITE_SETS.map((s) => s.id)];

/** A pinned set by id, or null for anything unknown — the caller falls back. */
export const spriteSetById = (id: string | null | undefined): SpriteSet | null =>
    id === "classic"
        ? DEFAULT_SET
        : GENERAL_SPRITE_SETS.find((s) => s.id === id)?.set ?? null;
