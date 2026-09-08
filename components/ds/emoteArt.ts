/* Emote art, PURE like avatarArt.ts and spriteArt.ts: no React, no CSS. The
 * id catalog lives in shared/emotes.js because the server validates against it. */
import { type PixelArt } from "./pixelArt";

/**
 * Every emote paints in TOKENS, the same three as the avatars, because it is
 * drawn on whichever palette the player runs, including custom ones, where a
 * literal colour can vanish (CLAUDE.md trap 11). Sized for ~28px, so nothing
 * relies on a one-pixel detail.
 */
const INK = "var(--ms-ink-strong)";
const OPEN = "var(--ms-cell-open)";
const ACCENT = "var(--ms-cell-mine)";

const PALETTE = { "#": INK, o: OPEN, R: ACCENT } as const;

/* An open hand, three fingers and a thumb; four are not legible at 28px. */
const WAVE: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "                ",
        "    ## ## ##    ",
        "    ## ## ##    ",
        "  # ## ## ##    ",
        " ### ## ## ##   ",
        " ############   ",
        " #oooooooooo#   ",
        "  #oooooooo#    ",
        "  #oooooooo#    ",
        "   #oooooo#     ",
        "    ######      ",
        "     ####       ",
        "                ",
        "                ",
        "                ",
    ],
};

/* Thumbs up. The knuckle row is what stops the fist reading as a box. */
const NICE: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "                ",
        "       ##       ",
        "      #oo#      ",
        "      #oo#      ",
        "   ####ooo####  ",
        "  #ooooooooooo# ",
        "  #ooo#ooo#ooo# ",
        "  #ooooooooooo# ",
        "  #ooooooooooo# ",
        "   ##########   ",
        "                ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

/* A question mark: "I don't know what to do here". */
const UNSURE: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "    ########    ",
        "   ###    ###   ",
        "   ###    ###   ",
        "          ###   ",
        "        ####    ",
        "      ####      ",
        "      ###       ",
        "      ###       ",
        "      ###       ",
        "                ",
        "      ###       ",
        "      ###       ",
        "                ",
        "                ",
    ],
};

/* A lit mine, "I think that one is a bomb". The spark is the accent. */
const CAREFUL: PixelArt = {
    palette: PALETTE,
    rows: [
        "       RR       ",
        "       ##       ",
        "    #  ##  #    ",
        "     # ## #     ",
        "      ####      ",
        "    ########    ",
        "   ##########   ",
        "  ###o########  ",
        "  ##oo########  ",
        "  ############  ",
        "  ############  ",
        "   ##########   ",
        "    ########    ",
        "                ",
        "                ",
        "                ",
    ],
};

/* A clock, hands in the accent so they read against the face at 28px. */
const HURRY: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##########   ",
        "  ####oooo####  ",
        " ###oooooooo### ",
        " ##ooooRooooo## ",
        " ##ooooRooooo## ",
        " ##ooooRooooo## ",
        " ##ooooRRRRoo## ",
        " ###oooooooo### ",
        "  ############  ",
        "   ##########   ",
        "     ######     ",
        "                ",
        "                ",
        "                ",
    ],
};

/* A heart, mostly in the accent: an all-ink heart reads as a spade. */
const THANKS: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "   ###   ###    ",
        "  #RRR# #RRR#   ",
        " #RRRRR#RRRRR#  ",
        " #RRRRRRRRRRR#  ",
        " #RRRRRRRRRRR#  ",
        "  #RRRRRRRRR#   ",
        "   #RRRRRRR#    ",
        "    #RRRRR#     ",
        "     #RRR#      ",
        "      #R#       ",
        "       #        ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

/** Keyed by the ids in shared/emotes.js. */
export const EMOTE_ART: Readonly<Record<string, PixelArt>> = {
    wave: WAVE,
    nice: NICE,
    unsure: UNSURE,
    careful: CAREFUL,
    hurry: HURRY,
    thanks: THANKS,
};

/**
 * The art for an id, or null for one this client cannot draw. Null rather than
 * a fallback glyph, unlike `avatarArtById`: an unknown emote is a message this
 * build does not know, and showing an arbitrary one puts words in someone's mouth.
 */
export const emoteArtById = (id: string | null | undefined): PixelArt | null =>
    (id && EMOTE_ART[id]) || null;
