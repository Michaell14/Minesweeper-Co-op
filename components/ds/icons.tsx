import React from "react";
import { rectsOf, type PixelArt } from "./pixelArt";

/**
 * Pixel icons as 16x16 character grids plus a palette, editable in place; a
 * space is transparent. The mine and flag are drawn the same way in sprites.tsx.
 */

export interface PixelIconProps extends React.SVGProps<SVGSVGElement> {
    /** Rendered width and height in px. The art is a 16x16 grid. */
    size?: number;
}

function PixelIcon({ art, size = 32, ...rest }: PixelIconProps & { art: PixelArt }) {
    return (
        <svg
            viewBox="0 0 16 16"
            width={size}
            height={size}
            shapeRendering="crispEdges"
            xmlns="http://www.w3.org/2000/svg"
            /* Decorative by default: callers carry the label. {...rest} can override. */
            aria-hidden={true}
            {...rest}
        >
            {rectsOf(art).map(({ x, y, w, fill }, i) => (
                <rect key={i} x={x} y={y} width={w} height={1} fill={fill} />
            ))}
        </svg>
    );
}

const GITHUB = {
    palette: {
        "#": "#333",
        "+": "#fff",
    },
    rows: [
        " ############## ",
        "####+########+##",
        "####++######++##",
        "####++++++++++##",
        "###++++++++++++#",
        "###++++++++++++#",
        "###++++++++++++#",
        "###++++++++++++#",
        "####++++++++++##",
        "#####++++++++###",
        "#++####++++#####",
        "###+##++++++####",
        "####++++++++####",
        "######++++++####",
        "######++++++####",
        " ############## ",
    ],
} as const;

const COIN = {
    palette: {
        "#": "#060606",
        "+": "#ffc107",
        ".": "#fff",
    },
    rows: [
        "     ######     ",
        "   ###...####   ",
        "  ##..+++++##   ",
        "  #.++...#++##  ",
        " ##.++.++#++##  ",
        " #.+++.++#+++## ",
        " #.+++.++#+++## ",
        " #.+++.++#+++## ",
        " #.+++.++#+++## ",
        " #.+++.++#+++## ",
        " #.+++.++#+++## ",
        " ##.++.++#++##  ",
        "  #.++.###++##  ",
        "  ##.++++++##   ",
        "   ###+++####   ",
        "     ######     ",
    ],
} as const;

const TROPHY = {
    palette: {
        "#": "#444",
        "+": "#ebe527",
        ".": "#f59f54",
        "o": "#fff",
    },
    rows: [
        "  ###########   ",
        "  #++++++++.#   ",
        "###+o++++++.### ",
        "# #+o++++++.# # ",
        "# #+o++++++.# # ",
        " ##+o++++++.##  ",
        "  #+o++++++.#   ",
        "  #++++++++.#   ",
        "   #++++++.#    ",
        "    #++++.#     ",
        "     #++.#      ",
        "      #+#       ",
        "      #+#       ",
        "     ##+##      ",
        "    #++++.#     ",
        "    #######     ",
    ],
} as const;

const PING = {
    /* Token-painted: this one rides in the reaction tray on every palette. */
    palette: {
        "#": "var(--ms-ink-strong)",
        "o": "var(--ms-cell-open)",
    },
    rows: [
        "                ",
        "     ######     ",
        "   ##oooooo##   ",
        "  #oo######oo#  ",
        " #oo##oooo##oo# ",
        " #o##o####o##o# ",
        " #o#o#oooo#o#o# ",
        " #o#o#o##o#o#o# ",
        " #o#o#o##o#o#o# ",
        " #o#o#oooo#o#o# ",
        " #o##o####o##o# ",
        " #oo##oooo##oo# ",
        "  #oo######oo#  ",
        "   ##oooooo##   ",
        "     ######     ",
        "                ",
    ],
} as const;

export const GithubIcon = (props: PixelIconProps) => <PixelIcon art={GITHUB} {...props} />;
export const CoinIcon = (props: PixelIconProps) => <PixelIcon art={COIN} {...props} />;
export const TrophyIcon = (props: PixelIconProps) => <PixelIcon art={TROPHY} {...props} />;

/** A bust in a circle, the universal "your account" shape. The footer's way into sign-in. */
const USER = {
    palette: {
        "#": "#333",
        "w": "#fff",
    },
    rows: [
        "     ######     ",
        "   ##wwwwww##   ",
        "  #wwwwwwwwww#  ",
        " #wwww####wwww# ",
        " #www######www# ",
        "#wwww######wwww#",
        "#wwww######wwww#",
        "#wwwww####wwwww#",
        "#www########www#",
        "#ww##########ww#",
        "#w############w#",
        " ############## ",
        " ############## ",
        "  ############  ",
        "   ##########   ",
        "     ######     ",
    ],
} as const;

export const UserIcon = (props: PixelIconProps) => <PixelIcon art={USER} {...props} />;

/** The signed-in state, filled with the primary intent token so every palette keeps it legible. */
const USER_SIGNED_IN = {
    palette: {
        "#": "#333",
        "w": "var(--ms-intent-primary)",
    },
    rows: USER.rows,
} as const;

export const UserSignedInIcon = (props: PixelIconProps) => (
    <PixelIcon art={USER_SIGNED_IN} {...props} />
);

/** A gear — the settings page. */
const GEAR = {
    palette: {
        "#": "#333",
        "w": "#fff",
    },
    rows: [
        "                ",
        "      ####      ",
        "  ##  #ww#  ##  ",
        " #ww###ww###ww# ",
        " #wwwwwwwwwwww# ",
        "  #wwwwwwwwww#  ",
        "  #www####www#  ",
        " ##ww#    #ww## ",
        " #www#    #www# ",
        " ##ww#    #ww## ",
        "  #www####www#  ",
        "  #wwwwwwwwww#  ",
        " #wwwwwwwwwwww# ",
        " #ww###ww###ww# ",
        "  ##  #ww#  ##  ",
        "      ####      ",
    ],
} as const;

export const GearIcon = (props: PixelIconProps) => <PixelIcon art={GEAR} {...props} />;

/** A star for the changelog, filled with the warning intent token. */
const STAR = {
    palette: {
        "#": "#333",
        "w": "var(--ms-intent-warning)",
    },
    rows: [
        "       ##       ",
        "      #ww#      ",
        "      #ww#      ",
        "     #wwww#     ",
        "     #wwww#     ",
        "######wwww######",
        "#wwwwwwwwwwwwww#",
        " #wwwwwwwwwwww# ",
        "  #wwwwwwwwww#  ",
        "   #wwwwwwww#   ",
        "   #wwwwwwww#   ",
        "  #www####www#  ",
        "  #ww#    #ww#  ",
        " #ww#      #ww# ",
        " ##          ## ",
        "                ",
    ],
} as const;

export const StarIcon = (props: PixelIconProps) => <PixelIcon art={STAR} {...props} />;

const CALENDAR = {
    palette: {
        "#": "currentColor",
    },
    rows: [
        "                ",
        "    ##    ##    ",
        "    ##    ##    ",
        " ############## ",
        " ############## ",
        " ############## ",
        " #            # ",
        " # ##  ##  ## # ",
        " # ##  ##  ## # ",
        " #            # ",
        " # ##  ##  ## # ",
        " # ##  ##  ## # ",
        " #            # ",
        " #            # ",
        " ############## ",
        "                ",
    ],
} as const;

const SWORDS = {
    palette: {
        "#": "currentColor",
    },
    rows: [
        "                ",
        "  ##        ##  ",
        "   ##      ##   ",
        "    ##    ##    ",
        "     ##  ##     ",
        "      ####      ",
        "       ##       ",
        "      ####      ",
        "     ##  ##     ",
        "  #####  #####  ",
        "    ##    ##    ",
        "   ##      ##   ",
        "  ##        ##  ",
        " ####      #### ",
        "                ",
        "                ",
    ],
} as const;

export const CalendarIcon = (props: PixelIconProps) => <PixelIcon art={CALENDAR} {...props} />;
export const SwordsIcon = (props: PixelIconProps) => <PixelIcon art={SWORDS} {...props} />;
export const PingIcon = (props: PixelIconProps) => <PixelIcon art={PING} {...props} />;
