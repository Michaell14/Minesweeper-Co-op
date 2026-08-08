import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Replaces the old static public/sitemap.xml, whose `lastmod` was hand-typed and
 * had been stale for over a year. This one stamps the build.
 *
 * Only indexable routes belong here — /ds, /settings and /profile are noindex, and
 * listing a page you have told Google to drop is a contradiction, not a hint.
 *
 * The old file carried an <image:image> entry; Next only types `images` from 15
 * on, and it pointed at the share card rather than page content anyway.
 */
const ROUTES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    // Daily, because the board behind it is a different puzzle every day.
    { path: "/daily", priority: 0.9, changeFrequency: "daily" },
    { path: "/how-to-play", priority: 0.7, changeFrequency: "monthly" },
    { path: "/no-guess-minesweeper", priority: 0.7, changeFrequency: "monthly" },
    // Carried over from the static file this replaced — /changelog sets its own
    // canonical and is indexable, so dropping it here would have quietly
    // deindexed a page that was already listed.
    { path: "/changelog", priority: 0.5, changeFrequency: "weekly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();
    return ROUTES.map(({ path, priority, changeFrequency }) => ({
        url: `${SITE_URL}${path}`,
        lastModified,
        changeFrequency,
        priority,
    }));
}
