import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import ProsePage from "@/components/marketing/ProsePage";

const TITLE = "How to Play Minesweeper — Rules, Chording and Multiplayer";
const DESCRIPTION =
    "The rules of Minesweeper, the chording shortcut most players never learn, and how co-op, 1v1 and the daily challenge each change the game.";

/** Own canonical — see the note in app/daily/page.tsx for what inheriting costs. */
export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/how-to-play` },
    openGraph: {
        type: "article",
        url: `${SITE_URL}/how-to-play`,
        title: TITLE,
        description: DESCRIPTION,
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * Q&A pairs, rendered as the page's own FAQ section AND as FAQPage structured
 * data, from one array. Two copies would drift, and structured data that does
 * not match the visible page is a policy violation rather than a mistake.
 */
const FAQ = [
    {
        q: "Is Minesweeper a game of luck?",
        a: "Not here. Every board is checked for logical solvability before you see it, so there is always a next move you can deduce. Classic Minesweeper can deal you an unavoidable 50/50 near the end; these boards cannot.",
    },
    {
        q: "What does the number in a cell mean?",
        a: "How many mines touch that cell, counting all eight neighbours including diagonals. A 1 has exactly one mine among its neighbours; a cell with no number has none at all, which is why opening one clears a whole region.",
    },
    {
        q: "Can you play Minesweeper with friends?",
        a: "Yes. Co-op puts everyone on one shared board with live cursors, and 1v1 gives two players the identical layout to race. Both take a room code, or quick match pairs you with whoever else is looking.",
    },
    {
        q: "What is chording in Minesweeper?",
        a: "Pressing both mouse buttons on an opened number whose mines you have all flagged opens every remaining neighbour at once. It is the single biggest speed gain available, and most players never learn it.",
    },
    {
        q: "Do I need an account to play?",
        a: "No. Rooms and the daily challenge both work with no sign-up and no download. An account only adds saved stats and streaks.",
    },
];

export default function HowToPlayPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "FAQPage",
                        mainEntity: FAQ.map(({ q, a }) => ({
                            "@type": "Question",
                            name: q,
                            acceptedAnswer: { "@type": "Answer", text: a },
                        })),
                    }),
                }}
            />

            <ProsePage
                title="How to Play Minesweeper"
                lede="The board hides mines. The numbers tell you where they are. Everything else is deduction — and once you know chording, speed."
                cta={{ href: "/", label: "Play now" }}>
                <section>
                    <h2 className="text-pixel-md font-bold">The rules</h2>
                    <p className="mt-3">
                        Open a cell and one of two things happens. If it hides a mine, the run ends.
                        If it does not, it shows a number: how many of its eight neighbours —
                        diagonals included — are mines. A cell with no neighbouring mines shows
                        nothing and opens all of its neighbours automatically, which is the cascade
                        that clears large areas in one click.
                    </p>
                    <p className="mt-3">
                        Your first click is always safe, and so is everything immediately around it.
                        The board is generated in response to that click rather than before it, so
                        there is no opening guess to get wrong.
                    </p>
                    <p className="mt-3">
                        Flag a cell to mark it as a mine you have worked out. Flags never affect the
                        board — they are a note to yourself, and to anyone playing with you. You win
                        when every safe cell is open; the flags do not have to be right, or there at
                        all.
                    </p>
                </section>

                <section>
                    <h2 className="text-pixel-md font-bold">Chording, the shortcut worth learning</h2>
                    <p className="mt-3">
                        Press both mouse buttons together on an opened number. If you have already
                        flagged as many neighbours as the number says, every other neighbour opens
                        at once. A 3 with three flags around it clears its five remaining cells in
                        one motion instead of five.
                    </p>
                    <p className="mt-3">
                        This is where nearly all of the difference between a slow time and a fast one
                        lives. It is also the reason flags are worth placing even though the win
                        condition ignores them: flags are what make chording possible.
                    </p>
                </section>

                <section>
                    <h2 className="text-pixel-md font-bold">Playing by keyboard</h2>
                    <p className="mt-3">
                        Arrow keys or WASD move a cursor, Space or Enter opens the cell under it, F
                        flags it, and Escape hides the cursor again. The whole game is playable
                        without a mouse.
                    </p>
                </section>

                <section>
                    <h2 className="text-pixel-md font-bold">The three modes</h2>
                    <p className="mt-3">
                        <strong>Co-op</strong> puts everyone in the room on a single shared board.
                        You see each other&apos;s cursors live, and one person&apos;s mistake ends
                        the round for the group — which is what makes talking to each other worth
                        it. Everyone scores a point for each safe cell their own move opens,
                        cascades included.
                    </p>
                    <p className="mt-3">
                        <strong>1v1</strong> gives two players the same layout and starts them at
                        the same moment. You are not sharing a board, you are racing identical ones,
                        so it comes down purely to who reads the numbers faster.
                    </p>
                    <p className="mt-3">
                        <strong>The <Link href="/daily">daily challenge</Link></strong> is one board
                        a day, the same for everyone, ranked by time, with a single attempt.
                    </p>
                </section>

                <section>
                    <h2 className="text-pixel-md font-bold">Common questions</h2>
                    <dl className="mt-3 space-y-4">
                        {FAQ.map(({ q, a }) => (
                            <div key={q}>
                                <dt className="font-bold">{q}</dt>
                                <dd className="mt-1 text-ink-muted">{a}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            </ProsePage>
        </>
    );
}
