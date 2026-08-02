import React from "react";

/**
 * Pixel icons, stored as the art itself.
 *
 * Each icon is a 16x16 grid of characters plus a palette mapping character to
 * colour, so the sprite is legible and editable in place — squint at the rows
 * below and you can see the shape. A space is a transparent pixel.
 *
 * To add an icon: draw a 16x16 block, list its colours, export a component.
 */

type Sprite = {
    readonly palette: Readonly<Record<string, string>>;
    readonly rows: readonly string[];
};

type Rect = { x: number; y: number; w: number; fill: string };

/**
 * Flatten a sprite into horizontal runs of same-coloured pixels — 252 pixels
 * become 52 rects for the GitHub mark. Runs at module load, not per render.
 */
function toRects({ palette, rows }: Sprite): Rect[] {
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

export interface PixelIconProps extends React.SVGProps<SVGSVGElement> {
    /** Rendered width and height in px. The art is a 16x16 grid. */
    size?: number;
}

function PixelIcon({ sprite, size = 32, ...rest }: PixelIconProps & { sprite: Rect[] }) {
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
            {sprite.map(({ x, y, w, fill }, i) => (
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

const PALETTE = {
    palette: {
        "#": "#212529",
        "w": "#f4f4f5",
        "r": "#e76e55",
        "y": "#f7d51d",
        "g": "#92cc41",
        "b": "#209cee",
    },
    rows: [
        "     ######     ",
        "   ##wwwwww##   ",
        "  #wwwwwwwwww#  ",
        " #wwrrwwwwggww# ",
        " #wwrrwwwwggww# ",
        "#wwwwwwwwwwwwww#",
        "#wyywwwwwwwwbbw#",
        "#wyywwwwwwwwbbw#",
        "#wwwwwwwwwwwwww#",
        " #wwwwwwwwwwww# ",
        " #wwwwww##wwww# ",
        "  #wwww#  #ww#  ",
        "   #ww#    #w#  ",
        "    #w#####w#   ",
        "     #wwwww#    ",
        "      #####     ",
    ],
} as const;

const GITHUB_RECTS = toRects(GITHUB);
const COIN_RECTS = toRects(COIN);
const TROPHY_RECTS = toRects(TROPHY);

export const GithubIcon = (props: PixelIconProps) => <PixelIcon sprite={GITHUB_RECTS} {...props} />;
export const CoinIcon = (props: PixelIconProps) => <PixelIcon sprite={COIN_RECTS} {...props} />;
export const TrophyIcon = (props: PixelIconProps) => <PixelIcon sprite={TROPHY_RECTS} {...props} />;

const PALETTE_RECTS = toRects(PALETTE);
export const PaletteIcon = (props: PixelIconProps) => <PixelIcon sprite={PALETTE_RECTS} {...props} />;

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

const USER_RECTS = toRects(USER);
export const UserIcon = (props: PixelIconProps) => <PixelIcon sprite={USER_RECTS} {...props} />;

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

const GEAR_RECTS = toRects(GEAR);
export const GearIcon = (props: PixelIconProps) => <PixelIcon sprite={GEAR_RECTS} {...props} />;
