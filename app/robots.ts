import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * /ds, /settings and /profile are NOT disallowed: they carry `robots: { index:
 * false }`, and a crawler blocked here never fetches the page to read it. No
 * Crawl-delay: Google ignores it, so it only ever throttled Bing.
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
