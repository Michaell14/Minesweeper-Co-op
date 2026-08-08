/**
 * The site's own absolute URLs, in one place.
 *
 * They are absolute rather than relative because they leave the page: Open
 * Graph, Twitter cards, JSON-LD and the sitemap are all read by something that
 * has no origin to resolve against.
 */
export const SITE_URL = "https://www.minesweepercoop.com";

/** The share card. 1200x630, generated from the design system's own tokens. */
export const OG_IMAGE = `${SITE_URL}/og.png`;
