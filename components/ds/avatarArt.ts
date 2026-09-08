/* The avatar art, PURE like spriteArt.ts: no React, no CSS. The id catalog
 * lives in shared/avatars.js because the server validates against it. */
import { type PixelArt } from "./pixelArt";
import { DEFAULT_AVATAR } from "@/shared/avatars";

/**
 * Every avatar paints in TOKENS, like the pinnable sprite sets, since it sits
 * on whichever palette the player runs. Three colours: page ink, opened-cell
 * fill, and the mine colour as the single accent. On Game Boy accent and ink
 * coincide; no shape relies on the accent alone.
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

/* Accent head, light inner ears and muzzle. Light inner ears keep the ear
 * shape readable on Game Boy, where accent merges into ink. */
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

/* ---------------------------------------------------------------------------
 * HOVER FRAMES. Pixel art animates by SWAPPING FRAMES: at 16x16 a rotation or
 * fractional scale is mush. Each frame is a whole grid differing from the base
 * by a few pixels, since a diff format would be unreadable to edit. Timing is
 * in Avatar.module.css, one @keyframes per frame; a frame without a matching
 * rule there draws nothing.
 * ------------------------------------------------------------------------- */

/* Frog, 1: the mouth opens onto the tongue. */
const FROG_OPEN: PixelArt = {
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
        " #oo#RRRRRR#oo# ",
        "  #o########o#  ",
        "   ##########   ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

/* Frog, 2: tongue out past the edge, eyes pulled down so the flick does not
 * read as a stuck-out tongue. */
const FROG_TONGUE: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "                ",
        "   ###    ###   ",
        "  #o##o##o##o#  ",
        "  #oooo##oooo#  ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #o##########o# ",
        " #oo#RRRRRRRRRRR",
        "  #o########o#  ",
        "   ##########   ",
        "                ",
        "                ",
        "                ",
        "                ",
    ],
};

/* Pirate, 1: the patch rides up over the bandana, revealing a working eye. */
const PIRATE_PEEK: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "    RRRRRRRR    ",
        "   RRRRRRRRRR   ",
        "  RRRRRRRRRRRR  ",
        "  R####RRRRRRR  ",
        " #o####ooooooRR ",
        " #o####ooooooRR ",
        " #oo##ooo##ooo# ",
        " #oo##ooo##ooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        "  #oo######oo#  ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Pirate, 2: that eye winks. Only the top row goes; taking both reads as one eye. */
const PIRATE_WINK: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "    RRRRRRRR    ",
        "   RRRRRRRRRR   ",
        "  RRRRRRRRRRRR  ",
        "  R####RRRRRRR  ",
        " #o####ooooooRR ",
        " #o####ooooooRR ",
        " #ooooooo##ooo# ",
        " #oo##ooo##ooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        "  #oo######oo#  ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Robot, 1: sockets widen and light, pupils right, beacon on. Waking IS the eyes opening. */
const ROBOT_SCAN_RIGHT: PixelArt = {
    palette: PALETTE,
    rows: [
        "       RR       ",
        "       ##       ",
        "      ####      ",
        "   ##########   ",
        "  #oooooooooo#  ",
        "  #oooooooooo#  ",
        "  #o###oo###o#  ",
        "  #o##Roo##Ro#  ",
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

/* Robot, 2: pupils left, beacon off, opposite the sweep so something always moves. */
const ROBOT_SCAN_LEFT: PixelArt = {
    palette: PALETTE,
    rows: [
        "       ##       ",
        "       ##       ",
        "      ####      ",
        "   ##########   ",
        "  #oooooooooo#  ",
        "  #oooooooooo#  ",
        "  #o###oo###o#  ",
        "  #oR##ooR##o#  ",
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

/* Classic, 1: the smile flattens — the beat before the mouth opens. */
const CLASSIC_FLAT: PixelArt = {
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
        " #oooooooooooo# ",
        "  #oo######oo#  ",
        "  #oooooooooo#  ",
        "   ##oooooo##   ",
        "     ######     ",
        "                ",
    ],
};

/* Classic, 2: the mousedown face, a Minesweeper reference. */
const CLASSIC_GASP: PixelArt = {
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
        " #ooo######ooo# ",
        " #ooo#oooo#ooo# ",
        "  #oo######oo#  ",
        "  #oooooooooo#  ",
        "   ##oooooo##   ",
        "     ######     ",
        "                ",
    ],
};

/* Puppy, 1: ears up, tongue lolling a row further out. */
const PUPPY_PANT_OUT: PixelArt = {
    palette: PALETTE,
    rows: [
        "  ###      ###  ",
        " #####    ##### ",
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
        "      RRRR      ",
    ],
};

/* Puppy, 2: ears drop, tongue back in. */
const PUPPY_PANT_IN: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "                ",
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
        "                ",
        "                ",
    ],
};

/* Kitty, 1: lids halfway, lower whiskers flicked in. */
const KITTY_HALF: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "  ##        ##  ",
        " #o##      ##o# ",
        " #ooo######ooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #oo##oooo##oo# ",
        " #oooooooooooo# ",
        "##oooo####oooo##",
        " #oooo#oo#oooo# ",
        " #oooooooooooo# ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Kitty, 2: shut, ears back. The closed lid is WIDER than the open eye, or
 * the eye just vanishes. */
const KITTY_SHUT: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        " ##          ## ",
        " #o##      ##o# ",
        " #ooo######ooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #o####oo####o# ",
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

/* Fox, 1: eyes narrowing. */
const FOX_HALF: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "  ##        ##  ",
        " #o##      ##o# ",
        " #oo##    ##oo# ",
        " #RRR######RRR# ",
        " #RRRRRRRRRRRR# ",
        " #RRRRRRRRRRRR# ",
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

/* Fox, 2: slits and a one-sided smirk. A fox squints where the others blink,
 * and HOLDS it. */
const FOX_SLY: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "  ##        ##  ",
        " #o##      ##o# ",
        " #oo##    ##oo# ",
        " #RRR######RRR# ",
        " #RRRRRRRRRRRR# ",
        " #RRRRRRRRRRRR# ",
        " #R####RR####R# ",
        " #RRRRRRRRRRRR# ",
        " #RoooRRRRoooR# ",
        " #ooooo##ooooo# ",
        "  #oooo##o##o#  ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Penguin, 1: flippers up, beak tip open on the squawk. */
const PENGUIN_FLAP_UP: PixelArt = {
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
        " #ooooo##ooooo# ",
        "####oooooooo####",
        " ###oooooooo### ",
        "  ##oooooooo##  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Penguin, 2: flippers low. They stay part of the OUTLINE, or they detach at
 * this size. */
const PENGUIN_FLAP_DOWN: PixelArt = {
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
        " #oooooooooooo# ",
        " ###oooooooo### ",
        " ###oooooooo### ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Ghost, 1: a pixel up, hem out of phase so the tentacles trail the body. */
const GHOST_UP: PixelArt = {
    palette: PALETTE,
    rows: [
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
        " #ooo#oo#oo#oo# ",
        "   ##  ##  ##   ",
        "                ",
        "                ",
        "                ",
    ],
};

/* Ghost, 2: a pixel down, hem back where it started. */
const GHOST_DOWN: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
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
    ],
};

/* Alien, 1: the eyes start to fill. */
const ALIEN_GLOW_HALF: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        " #oooooooooooo# ",
        " #o###oooo###o# ",
        " #oRRRRooRRRRo# ",
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

/* Alien, 2: fully lit. The only avatar that animates by COLOUR alone. */
const ALIEN_GLOW_FULL: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        " #oooooooooooo# ",
        " #oRRRooooRRRo# ",
        " #oRRRRooRRRRo# ",
        " #ooRRooooRRoo# ",
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

/* Shinobi, 1: the headband tail whips up. */
const SHINOBI_WHIP_UP: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##########   ",
        "  ############ R",
        " ##############R",
        " #RRRRRRRRRRRR#R",
        " ##oooooooooo## ",
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

/* Shinobi, 2: and down. The tail is the only thing a masked head can move. */
const SHINOBI_WHIP_DOWN: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "     ######     ",
        "   ##########   ",
        "  ############  ",
        " ############## ",
        " #RRRRRRRRRRRR#R",
        " ##oooooooooo##R",
        " ##o##oooo##o##R",
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

/* Mushroom, 1: the cap squashes onto the stem, wider than it is at rest. */
const MUSHROOM_SQUASH: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "                ",
        "     ######     ",
        "   ##RRRRRR##   ",
        "  #RRooRRooRR#  ",
        " #RRRRRRRRRRRR# ",
        "#RRRRRRRRRRRRRR#",
        "################",
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

/* Mushroom, 2: and springs a pixel clear of the ground. */
const MUSHROOM_STRETCH: PixelArt = {
    palette: PALETTE,
    rows: [
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
        "                ",
    ],
};

/* ---------------------------------------------------------------------------
 * THE EARNED FOUR: unlocked by an achievement (mapping in shared/avatars.js,
 * server-enforced). The DRAWING is no different; only the picker is.
 * ------------------------------------------------------------------------- */

/* Apex predator: a toothy grin with the maw as the accent. */
const SHARK: PixelArt = {
    palette: PALETTE,
    rows: [
        "      ##        ",
        "     ####       ",
        "    ######      ",
        "   ##########   ",
        "  #oooooooooo#  ",
        " #oooooooooooo# ",
        " #oo##oooo##oo# ",
        " #oo##oooo##oo# ",
        " #oooooooooooo# ",
        " ############## ",
        " #o#o#o#o#o#o## ",
        " #RRRRRRRRRRRR# ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Shark, 1: the jaw drops — teeth top and bottom, maw wide open. */
const SHARK_OPEN: PixelArt = {
    palette: PALETTE,
    rows: [
        "      ##        ",
        "     ####       ",
        "    ######      ",
        "   ##########   ",
        "  #oooooooooo#  ",
        " #oooooooooooo# ",
        " #oo##oooo##oo# ",
        " ############## ",
        " #o#o#o#o#o#o## ",
        " #RRRRRRRRRRRR# ",
        " #RRRRRRRRRRRR# ",
        " #o#o#o#o#o#o## ",
        " ############## ",
        "  ##########    ",
        "                ",
        "                ",
    ],
};

/* Shark, 2: snapped shut, nothing but a clamped line where the maw was. */
const SHARK_SNAP: PixelArt = {
    palette: PALETTE,
    rows: [
        "      ##        ",
        "     ####       ",
        "    ######      ",
        "   ##########   ",
        "  #oooooooooo#  ",
        " #oooooooooooo# ",
        " #oo##oooo##oo# ",
        " #oo##oooo##oo# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " ############## ",
        " #oooooooooooo# ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* The hive: antennae, and a banded body in the accent. */
const BEE: PixelArt = {
    palette: PALETTE,
    rows: [
        "  #          #  ",
        "   #        #   ",
        "    ########    ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        "  #o##oooo##o#  ",
        "  #o##oooo##o#  ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "  #RRRRRRRRRR#  ",
        "  #oooooooooo#  ",
        "  #RRRRRRRRRR#  ",
        "  #oooooooooo#  ",
        "  #RRRRRRRRRR#  ",
        "   ##########   ",
        "                ",
    ],
};

/* Bee, 1: antennae snap upright and the bands shift a row, a wingbeat at this size. */
const BEE_BUZZ: PixelArt = {
    palette: PALETTE,
    rows: [
        "   #        #   ",
        "   #        #   ",
        "    ########    ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        "  #o##oooo##o#  ",
        "  #o##oooo##o#  ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "  #oooooooooo#  ",
        "  #RRRRRRRRRR#  ",
        "  #oooooooooo#  ",
        "  #RRRRRRRRRR#  ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "                ",
    ],
};

/* Bee, 2: a pixel of lift, antennae flicked down. */
const BEE_LIFT: PixelArt = {
    palette: PALETTE,
    rows: [
        "   #        #   ",
        "    ########    ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        "  #o##oooo##o#  ",
        "  #o##oooo##o#  ",
        "  #oooooooooo#  ",
        "   ##########   ",
        "  #RRRRRRRRRR#  ",
        "  #oooooooooo#  ",
        "  #RRRRRRRRRR#  ",
        "  #oooooooooo#  ",
        "  #RRRRRRRRRR#  ",
        "   ##########   ",
        "                ",
        "                ",
    ],
};

/* Thirty days running. The face is LIGHT fill with ink features, not an accent
 * disc: on Game Boy an accent face merges into its eyes. The rays carry the accent. */
const SUN: PixelArt = {
    palette: PALETTE,
    rows: [
        "      R  R      ",
        "   R        R   ",
        "     ######     ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #o####oo####o# ",
        "R#oooooooooooo#R",
        " #oooooooooooo# ",
        " #o##oooooo##o# ",
        "  #oo######oo#  ",
        "  #oooooooooo#  ",
        "   ##oooooo##   ",
        "   R        R   ",
        "      R  R      ",
    ],
};

/* Sun, 1: the rays reach. */
const SUN_FLARE: PixelArt = {
    palette: PALETTE,
    rows: [
        "     R    R     ",
        "  R          R  ",
        "     ######     ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #o####oo####o# ",
        "R#oooooooooooo#R",
        " #oooooooooooo# ",
        " #o##oooooo##o# ",
        "  #oo######oo#  ",
        "  #oooooooooo#  ",
        "   ##oooooo##   ",
        "  R          R  ",
        "     R    R     ",
    ],
};

/* Sun, 2: and draw back in. The disc never moves — only the light does. */
const SUN_EBB: PixelArt = {
    palette: PALETTE,
    rows: [
        "                ",
        "    R      R    ",
        "     ######     ",
        "   ##oooooo##   ",
        "  #oooooooooo#  ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #o####oo####o# ",
        " #oooooooooooo# ",
        " #oooooooooooo# ",
        " #o##oooooo##o# ",
        "  #oo######oo#  ",
        "  #oooooooooo#  ",
        "   ##oooooo##   ",
        "    R      R    ",
        "                ",
    ],
};

/* A hundred boards cleared: a helm, plume in the accent, visor open. */
const KNIGHT: PixelArt = {
    palette: PALETTE,
    rows: [
        "      RRRR      ",
        "      RRRR      ",
        "   ##########   ",
        "  ############  ",
        "  ############  ",
        "  #oooooooooo#  ",
        "  #####oo#####  ",
        "  #####oo#####  ",
        "  #####oo#####  ",
        "  ####o##o####  ",
        "  ############  ",
        "  ############  ",
        "   ##########   ",
        "    ########    ",
        "                ",
        "                ",
    ],
};

/* Knight, 1: visor shut. Only the breath holes remain, which keeps a block of
 * ink reading as a helmet. */
const KNIGHT_SHUT: PixelArt = {
    palette: PALETTE,
    rows: [
        "      RRRR      ",
        "      RRRR      ",
        "   ##########   ",
        "  ############  ",
        "  ############  ",
        "  ############  ",
        "  ############  ",
        "  ############  ",
        "  ############  ",
        "  ####o##o####  ",
        "  ############  ",
        "  ############  ",
        "   ##########   ",
        "    ########    ",
        "                ",
        "                ",
    ],
};

/* Knight, 2: and lifts wide, plume flared. */
const KNIGHT_WIDE: PixelArt = {
    palette: PALETTE,
    rows: [
        "     RRRRRR     ",
        "      RRRR      ",
        "   ##########   ",
        "  ############  ",
        "  #oooooooooo#  ",
        "  #oooooooooo#  ",
        "  #####oo#####  ",
        "  #####oo#####  ",
        "  #####oo#####  ",
        "  ####o##o####  ",
        "  ############  ",
        "  ############  ",
        "   ##########   ",
        "    ########    ",
        "                ",
        "                ",
    ],
};

/** Art keyed by catalog id; avatarArt.test.ts fails if this drifts from shared/avatars.js. */
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
    shark: SHARK,
    bee: BEE,
    sun: SUN,
    knight: KNIGHT,
};

/** Hover frames per id, in play order after the base art. An id absent here never animates. */
export const AVATAR_HOVER_FRAMES: Readonly<Record<string, readonly PixelArt[]>> = {
    classic: [CLASSIC_FLAT, CLASSIC_GASP],
    puppy: [PUPPY_PANT_OUT, PUPPY_PANT_IN],
    kitty: [KITTY_HALF, KITTY_SHUT],
    fox: [FOX_HALF, FOX_SLY],
    frog: [FROG_OPEN, FROG_TONGUE],
    penguin: [PENGUIN_FLAP_UP, PENGUIN_FLAP_DOWN],
    robot: [ROBOT_SCAN_RIGHT, ROBOT_SCAN_LEFT],
    ghost: [GHOST_UP, GHOST_DOWN],
    alien: [ALIEN_GLOW_HALF, ALIEN_GLOW_FULL],
    shinobi: [SHINOBI_WHIP_UP, SHINOBI_WHIP_DOWN],
    pirate: [PIRATE_PEEK, PIRATE_WINK],
    mushroom: [MUSHROOM_SQUASH, MUSHROOM_STRETCH],
    shark: [SHARK_OPEN, SHARK_SNAP],
    bee: [BEE_BUZZ, BEE_LIFT],
    sun: [SUN_FLARE, SUN_EBB],
    knight: [KNIGHT_SHUT, KNIGHT_WIDE],
};

/** The id whose art draws: unknown ids resolve to the default, like spriteSetById. */
export const resolvedAvatarId = (id: string | null | undefined): string =>
    id && AVATAR_ART[id] ? id : DEFAULT_AVATAR;

/** The art for a stored id, through the same fallback. */
export const avatarArtById = (id: string | null | undefined): PixelArt =>
    AVATAR_ART[resolvedAvatarId(id)];

/** Every frame for a stored id, base first; one entry when there are no hover frames. */
export const avatarFramesById = (id: string | null | undefined): readonly PixelArt[] => {
    const resolved = resolvedAvatarId(id);
    return [AVATAR_ART[resolved], ...(AVATAR_HOVER_FRAMES[resolved] ?? [])];
};
