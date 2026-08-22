/* The emote art, in a PURE module like avatarArt.ts and spriteArt.ts: no React,
 * no CSS import. The id catalog (ids + labels) lives in shared/emotes.js because
 * the server validates against it; only the drawing lives here.
 */
import { type PixelArt } from "./pixelArt";

/**
 * Every emote paints in TOKENS, the same three as the avatars: outlines and
 * solid shapes in the page ink, interiors in the opened-cell fill, and the mine
 * colour as the single accent. An emote is drawn on whichever palette the
 * player runs — including a custom one — so a literal colour would vanish on
 * one of them the way a black bomb does on Game Boy (CLAUDE.md trap 11).
 *
 * Sized for ~28px in the tray and the feed, which is why nothing here relies on
 * a one-pixel detail to read.
 */
const INK = "var(--ms-ink-strong)";
const OPEN = "var(--ms-cell-open)";
const ACCENT = "var(--ms-cell-mine)";

const PALETTE = { "#": INK, o: OPEN, R: ACCENT } as const;

/* An open hand, three fingers and a thumb — legible at 28px, which four
 * fingers and their gaps are not. */
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

/* A question mark: "I don't know what to do here", the single most common
 * thing one player wants to say to another on a shared board. */
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

/* A lit mine — "I think that one is a bomb". The spark is the accent, the one
 * place a warning colour earns its keep. */
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

/* A heart. The one emote drawn mostly in the accent — it is the shape people
 * expect in colour, and an all-ink heart reads as a spade. */
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
 * The art for an id, or null for one this client cannot draw.
 *
 * Null rather than a fallback glyph, which is the opposite of `avatarArtById`
 * and deliberate: an avatar must always draw something because a row in a
 * leaderboard needs a face, but an unknown emote is a message this build does
 * not know — showing an arbitrary one puts words in someone's mouth. The feed
 * drops it instead.
 */
export const emoteArtById = (id: string | null | undefined): PixelArt | null =>
    (id && EMOTE_ART[id]) || null;
