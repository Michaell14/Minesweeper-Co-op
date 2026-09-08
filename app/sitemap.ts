import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { LESSONS } from "@/lib/drills";

/**
 * Replaces the static public/sitemap.xml, whose hand-typed `lastmod` went
 * stale; this stamps the build. Only indexable routes: /ds, /settings and
 * /profile are noindex, and listing a noindex page is a contradiction.
 */
const ROUTES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
    { path: "", priority: 1, changeFrequency: "weekly" },
    // Daily, because the board behind it is a different puzzle every day.
    { path: "/daily", priority: 0.9, changeFrequency: "daily" },
    { path: "/how-to-play", priority: 0.7, changeFrequency: "monthly" },
    { path: "/no-guess-minesweeper", priority: 0.7, changeFrequency: "monthly" },
    { path: "/drills", priority: 0.7, changeFrequency: "monthly" },
    // One per lesson: the pattern names are the searched terms.
    ...LESSONS.map((lesson) => ({
        path: `/drills/${lesson.id}`,
        priority: 0.6,
        changeFrequency: "monthly" as const,
    })),
    // /changelog is indexable and was already listed; dropping it would deindex it.
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
