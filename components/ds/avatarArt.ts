/* The avatar art, in a PURE module like spriteArt.ts: no React, no CSS import.
 * The id catalog (ids + labels) lives in shared/avatars.js because the server
 * validates against it; only the drawing lives here.
 */
import { type PixelArt } from "./pixelArt";
import { DEFAULT_AVATAR } from "@/shared/avatars";

/**
 * Every avatar paints in TOKENS, the same rule as the pinnable sprite sets: a
 * profile picture sits on whichever palette the player runs, so a literal
 * colour would vanish on one of them the way a black bomb does on Game Boy.
 * Three colours total — outline and features in the page ink, faces in the
 * opened-cell fill, and the mine colour as the single accent (tongue, beak,
 * bandana, cap). On Game Boy the accent and the ink are the same colour by
 * design; the art still reads because no shape relies on the accent alone.
 */
const INK = "var(--ms-ink-strong)";
const OPEN = "var(--ms-cell-open)";
const ACCENT = "var(--ms-cell-mine)";

const PALETTE = { "#": INK, o: OPEN, R: ACCENT } as const;

/** The classic Minesweeper status face. Also the default for every account. */
const CLASSIC: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        "  #oooooooooo#  ",
        " #oooooooooooo# ",
        " #oo##oooo##oo# ",
        " #oo##oooo##oo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #o##oooooo##o# ",
        "  #oo######oo#  ",
        "  #oooooooooo#  ",
        "   ##oooooo##   ",
        "     ######     ",
        "                ",
    ],
};

/* Floppy ink ear flaps, a big nose, the tongue as the accent. */
const PUPPY: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "  ###      ###  ",
        " #####    ##### ",
        " ###o######o### ",
        " ##oooooooooo## ",
        " #oooooooooooo# ",
        " #oo##oooo##oo# ",
        " #oo##oooo##oo# ",
        " #oooooooooooo# ",
        " #oooo####oooo# ",
        " #oooo####oooo# ",
        " #oooooooooooo# ",
        "  #oo######oo#  ",
        "   ###RRRR###   ",
        "      RRRR      ",
        "                ",
    ],
};

/* Pointed ears and whiskers past the outline — the whiskers are what say cat. */
const KITTY: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "  ##        ##  ",
        " #o##      ##o# ",
        " #ooo######ooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #oo##oooo##oo# ",
        " #oo##oooo##oo# ",
        " #oooooooooooo# ",
        "##oooo####oooo##",
        " #oooo#oo#oooo# ",
        "##oooooooooooo##",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Accent head, light inner ears and muzzle. The inner ears are the light fill
 * on purpose: on Game Boy the accent merges into ink, and the light tips are
 * what keep the ear shape readable there. */
const FOX: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "  ##        ##  ",
        " #o##      ##o# ",
        " #oo##    ##oo# ",
        " #RRR######RRR# ",
        " #RRRRRRRRRRRR# ",
        " #RR##RRRR##RR# ",
        " #RR##RRRR##RR# ",
        " #RRRRRRRRRRRR# ",
        " #RoooRRRRoooR# ",
        " #ooooo##ooooo# ",
        "  #oooo##oooo#  ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Eyes on top of the head, a mouth the whole face wide. */
const FROG: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "   ###    ###   ",
        "  #ooo#  #ooo#  ",
        "  #o##o##o##o#  ",
        "  #oooo##oooo#  ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #o##########o# ",
        " #oooooooooooo# ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

/* Ink head, light face patches, the beak as the accent, white belly bust. */
const PENGUIN: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##########   ",
        "  ############  ",
        " ############## ",
        " ##oooo##oooo## ",
        " #ooo##oo##ooo# ",
        " #oooo#RR#oooo# ",
        " #ooooRRRRoooo# ",
        " #oooooRRooooo# ",
        " ###oooooooo### ",
        " ###oooooooo### ",
        "  ##oooooooo##  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Antenna, square eyes, a toothed grille. */
const ROBOT: PixelArt = {
    palette: PALETTE,
    rows: [
        "       ##       ",
        "       ##       ",
        "      ####      ",
        "   ##########   ",
        "  #oooooooooo#  ",
        "  #oooooooooo#  ",
        "  #o##oooo##o#  ",
        "  #o##oooo##o#  ",
        "  #oooooooooo#  ",
        "  #o########o#  ",
        "  #o##o##o##o#  ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "    ##    ##    ",
        "                ",
        "                ",
    ],
};

/* Hollow eyes, a wavy hem, tentacle feet. */
const GHOST: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        "  #oooooooooo#  ",
        " #oo##oooo##oo# ",
        " #oo##oooo##oo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #oooo####oooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #o#oo#oo#oo#o# ",
        " ##  ##  ##  ## ",
        "                ",
        "                ",
    ],
};

/* Big head, brooding almond eyes, a pointed chin. */
const ALIEN: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        " #oooooooooooo# ",
        " #o###oooo###o# ",
        " #o####oo####o# ",
        " #oo##oooo##oo# ",
        " #oooooooooooo# ",
        "  #oooooooooo#  ",
        "   #oooooooo#   ",
        "    #oo##oo#    ",
        "     #oooo#     ",
        "      ####      ",
        "                ",
        "                ",
    ],
};

/* Masked head, only the eyes showing, the headband tied off as the accent. */
const SHINOBI: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##########   ",
        "  ############  ",
        " ##############R",
        " #RRRRRRRRRRRR#R",
        " ##oooooooooo##R",
        " ##o##oooo##o## ",
        " ##oooooooooo## ",
        " ############## ",
        " ############## ",
        "  ############  ",
        "  ############  ",
        "   ##########   ",
        "     ######     ",
        "                ",
    ],
};

/* Bandana as the accent, an eyepatch over the left eye. */
const PIRATE: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "    RRRRRRRR    ",
        "   RRRRRRRRRR   ",
        "  RRRRRRRRRRRR  ",
        "  RRRRRRRRRRRR  ",
        " #oooooooooooRR ",
        " #o####ooooooRR ",
        " #o####oo##ooo# ",
        " #o####oo##ooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        "  #oo######oo#  ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Spotted accent cap over a small smiling face. */
const MUSHROOM: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##RRRRRR##   ",
        "  #RRRRRRRRRR#  ",
        " #RRooRRRRooRR# ",
        " #RRooRRRRooRR# ",
        " #RRRRRRRRRRRR# ",
        " ############## ",
        "  #oooooooooo#  ",
        "  #o##oooo##o#  ",
        "  #o##oooo##o#  ",
        "  #oooooooooo#  ",
        "   #oo####oo#   ",
        "    ########    ",
        "                ",
        "                ",
    ],
};

/** Art keyed by catalog id — avatarArt.test.ts fails if this drifts from
 * shared/avatars.js in either direction. */
export const AVATAR_ART: Readonly<Record<string, PixelArt>> = {
    classic: CLASSIC,
    puppy: PUPPY,
    kitty: KITTY,
    fox: FOX,
    frog: FROG,
    penguin: PENGUIN,
    robot: ROBOT,
    ghost: GHOST,
    alien: ALIEN,
    shinobi: SHINOBI,
    pirate: PIRATE,
    mushroom: MUSHROOM,
};

/**
 * The id whose art actually draws: unknown ids — an avatar removed from the
 * catalog, a hand-edited value — resolve to the default rather than blank,
 * the same defensive shape as spriteSetById.
 */
export const resolvedAvatarId = (id: string | null | undefined): string =>
    id && AVATAR_ART[id] ? id : DEFAULT_AVATAR;

/** The art for a stored id, through the same fallback. */
export const avatarArtById = (id: string | null | undefined): PixelArt =>
    AVATAR_ART[resolvedAvatarId(id)];
