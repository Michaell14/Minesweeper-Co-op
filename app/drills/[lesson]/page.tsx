import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import ProsePage from "@/components/marketing/ProsePage";
import LessonDrills from "@/components/drills/LessonDrills";
import { LESSONS, drillsForLesson, lessonById } from "@/lib/drills";

interface LessonPageProps {
    params: { lesson: string };
}

export function generateStaticParams() {
    return LESSONS.map((lesson) => ({ lesson: lesson.id }));
}

export function generateMetadata({ params }: LessonPageProps): Metadata {
    const lesson = lessonById(params.lesson);
    if (!lesson) return {};

    const title = `${lesson.title} — Minesweeper Drills`;
    const url = `${SITE_URL}/drills/${lesson.id}`;
    return {
        title,
        description: lesson.blurb,
        alternates: { canonical: url },
        openGraph: { type: "article", url, title, description: lesson.blurb },
        twitter: { card: "summary_large_image", title, description: lesson.blurb },
        // A lesson with no drills written yet is a real page with nothing on it.
        ...(drillsForLesson(lesson.id).length === 0 ? { robots: { index: false } } : {}),
    };
}

export default function LessonPage({ params }: LessonPageProps) {
    const lesson = lessonById(params.lesson);
    if (!lesson) notFound();

    const drills = drillsForLesson(lesson.id);

    return (
        <ProsePage title={lesson.title} lede={lesson.blurb} cta={{ href: "/drills", label: "All drills" }}>
            {drills.length === 0 ? (
                <p>These drills are still being written.</p>
            ) : (
                <div className="not-prose">
                    <LessonDrills drills={drills} />
                </div>
            )}
        </ProsePage>
    );
}
