import React from "react";
import { rectsOf, type PixelArt } from "./pixelArt";

/**
 * Pixel icons, stored as the art itself.
 *
 * Each icon is a 16x16 grid of characters plus a palette mapping character to
 * colour, so the sprite is legible and editable in place — squint at the rows
 * below and you can see the shape. A space is a transparent pixel.
 *
 * To add an icon: draw a 16x16 block, list its colours, export a component.
 * The board's mine and flag are drawn the same way, in sprites.tsx.
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
            /*
             * Decorative by default: every caller wraps the icon in a link or
             * button that already carries its own aria-label. An icon used as a
             * control's only content should pass aria-hidden={false} and a
             * label, since {...rest} wins.
             */
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

export const GithubIcon = (props: PixelIconProps) => <PixelIcon art={GITHUB} {...props} />;
export const CoinIcon = (props: PixelIconProps) => <PixelIcon art={COIN} {...props} />;
export const TrophyIcon = (props: PixelIconProps) => <PixelIcon art={TROPHY} {...props} />;

/** Head and shoulders — the account menu. */
const USER = {
    palette: {
        "#": "#333",
        "w": "#fff",
    },
    rows: [
        "                ",
        "     ######     ",
        "    #wwwwww#    ",
        "    #wwwwww#    ",
        "    #wwwwww#    ",
        "    #wwwwww#    ",
        "     ######     ",
        "      #ww#      ",
        "   ####ww####   ",
        "  #wwwwwwwwww#  ",
        " #wwwwwwwwwwww# ",
        " #wwwwwwwwwwww# ",
        " #wwwwwwwwwwww# ",
        " #wwwwwwwwwwww# ",
        " ############## ",
        "                ",
    ],
} as const;

export const UserIcon = (props: PixelIconProps) => <PixelIcon art={USER} {...props} />;

/**
 * The same head and shoulders, filled with the primary intent — the footer's
 * signed-in state, where the icon links to /profile instead of opening the
 * sign-in dialog. A token, not a literal, so every palette keeps it legible.
 */
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
