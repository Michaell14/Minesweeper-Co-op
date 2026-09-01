import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import ProsePage from "@/components/marketing/ProsePage";
import LessonCard from "@/components/drills/LessonCard";
import { DRILLS, LESSONS } from "@/lib/drills";

const TITLE = "Minesweeper Drills — Practise the 1-1, 1-2-1 and 1-2-2-1 Patterns";
const DESCRIPTION =
    "Short interactive Minesweeper puzzles that teach the patterns by name: counting, 1-1, 1-2, 1-2-1, 1-2-2-1 and the subset rule they are all special cases of.";

/** Own canonical — see the note in app/daily/page.tsx for what inheriting costs. */
export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/drills` },
    openGraph: {
        type: "article",
        url: `${SITE_URL}/drills`,
        title: TITLE,
        description: DESCRIPTION,
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/*
 * No `cta`. The lessons are the page's call to action, and a primary button
 * pointing off to a full game read as the main thing to do here — which is the
 * one thing this page is not for. Playing is still one tap away in the header
 * and in the footer links ProsePage draws.
 *
 * An ordered list, not a grid: the lessons are a ladder that ends on "the
 * general rule every pattern above is a special case of", so the order is
 * information and starting at the top is the advice.
 */
export default function DrillsPage() {
    return (
        <ProsePage
            title="Minesweeper Drills"
            lede="Small boards, one deduction each, no timer and no way to lose. Every drill is solvable by pure logic — and tells you which rule solved it.">
            <ol className="not-prose flex list-none flex-col gap-4 p-0">
                {LESSONS.map((lesson, i) => (
                    <LessonCard
                        key={lesson.id}
                        lesson={lesson}
                        ordinal={i + 1}
                        drillIds={DRILLS.filter((d) => d.lesson === lesson.id).map((d) => d.id)}
                    />
                ))}
            </ol>
        </ProsePage>
    );
}
