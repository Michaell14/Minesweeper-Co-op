import localFont from "next/font/local";

/**
 * Inter, for body copy inside `.ms-prose` (app/globals.css) and nowhere else:
 * every other element is set in the pixel face.
 *
 * Declared HERE, not in the root layout, because next/font preloads a font on
 * every route under the module that declares it. In the layout that was 48 kB
 * downloaded by the game page, which never sets a line of Inter. Only the
 * prose shells import this, so only their routes preload it.
 *
 * Put `proseFont.variable` on the `.ms-prose` element itself: it is what
 * defines `--font-inter`, and the prose rule reads it from there.
 */
export const proseFont = localFont({
    src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
    weight: "100 900",
    display: "swap",
    variable: "--font-inter",
});
