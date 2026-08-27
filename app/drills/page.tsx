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

export default function DrillsPage() {
    return (
        <ProsePage
            title="Minesweeper Drills"
            lede="Small boards, one deduction each, no timer and no way to lose. Every drill is solvable by pure logic — and tells you which rule solved it."
            cta={{ href: "/", label: "Play a full game" }}>
            <div className="not-prose grid gap-4 sm:grid-cols-2">
                {LESSONS.map((lesson) => (
                    <LessonCard
                        key={lesson.id}
                        lesson={lesson}
                        drillIds={DRILLS.filter((d) => d.lesson === lesson.id).map((d) => d.id)}
                    />
                ))}
            </div>
        </ProsePage>
    );
}
