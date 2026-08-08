import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Replaces the old static public/robots.txt.
 *
 * /ds, /settings and /profile are NOT disallowed — they already carry
 * `robots: { index: false }`, and a crawler that is blocked here never fetches
 * the page to read that tag. Disallow keeps a URL out of the crawl; noindex
 * keeps it out of the index. Only one of the two can be doing the work.
 *
 * No Crawl-delay either: Google ignores it, Bing obeys it, so the only thing it
 * ever did was throttle Bing.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: "/api/",
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
