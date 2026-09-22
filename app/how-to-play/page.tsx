import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import ProsePage from "@/components/marketing/ProsePage";
import { DIFFICULTY_LEVELS, MAX_SAFE_DENSITY } from "@/shared/boardConfig";

const TITLE = "How to Play Minesweeper — Rules, Chording, Multiplayer and No-Guess Boards";
const DESCRIPTION =
    "The rules of Minesweeper, the chording shortcut most players never learn, how co-op, 1v1 and the daily challenge each change the game, and how every board is checked to be solvable without guessing.";

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

const pct = (density: number) => `${(density * 100).toFixed(1)}%`;

/**
 * The measured per-candidate solvable rates behind the density ceiling, on a
 * 20x16 board. Recorded in shared/boardConfig.js — quoted rather than re-derived
 * so the page and the constant cannot disagree.
 */
const SOLVABLE_RATES = [
    { density: "18.8%", rate: "17%" },
    { density: "20.6%", rate: "7%" },
    { density: "22%", rate: "3%" },
    { density: "24%", rate: "0.3%" },
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
                    <p className="mt-3">
                        Chording is only worth as much as your flags are right, which comes down to
                        reading the patterns. The <Link href="/drills">pattern drills</Link> are
                        short interactive puzzles for exactly that — 1-1, 1-2, 1-2-1, 1-2-2-1, and
                        the rule they are all special cases of.
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

                {/* Folded in from the former /no-guess-minesweeper page, which now
                    redirects here (next.config.mjs). The id is the redirect's anchor. */}
                <section id="no-guess">
                    <h2 className="text-pixel-md font-bold">No-guess boards</h2>
                    <p className="mt-3">
                        Classic Minesweeper will eventually deal you a position where two cells are
                        equally likely to be the mine and nothing on the board can tell them apart.
                        Losing there is a coin flip, not a mistake. Every board here is built so
                        that never happens: at every point in the game there is at least one cell
                        you can prove is safe using only what the board is showing you. It does not
                        mean the board is easy, and it does not mean you cannot lose — if you lose,
                        you missed something, and the deduction was there.
                    </p>
                    <p className="mt-3">
                        It is generate-and-test. A candidate layout is drawn at random, and a
                        solver plays it the way a careful person would — only ever taking moves it
                        can prove, never guessing. If the solver clears the board, you get that
                        layout. If it gets stuck, the candidate is thrown away and another is
                        drawn, up to 300 times. The solver is the honest part: it is not checking
                        that the board looks reasonable, it is checking that a complete chain of
                        deductions exists from the opening cascade to the last safe cell.
                    </p>
                    <p className="mt-3">
                        Solvable layouts get rare fast as mine density climbs, and the rate was
                        measured rather than guessed at. On a 20x16 board, the share of random
                        candidates the solver can clear:
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-6">
                        {SOLVABLE_RATES.map(({ density, rate }) => (
                            <li key={density}>
                                {density} density — <strong>{rate}</strong> of candidates are solvable
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3">
                        At 300 attempts, {pct(MAX_SAFE_DENSITY)} never once fell through to an
                        unchecked board across 200 games on every board size.{" "}
                        {SOLVABLE_RATES[2].density} still did. So {pct(MAX_SAFE_DENSITY)} is where
                        the hardest difficulty sits — not because it felt right, but because it is
                        the densest board the guarantee survives. It is also exactly classic
                        Minesweeper&apos;s Expert density, 99 mines on a 30x16 grid.
                    </p>
                    <p className="mt-3">
                        Difficulty is a mine density rather than a fixed count, applied to whichever
                        board size you pick, so the mine count is always derived from the two:
                    </p>
                    <ul className="mt-3 list-disc space-y-1 pl-6">
                        {DIFFICULTY_LEVELS.map(({ title, density }: { title: string; density: number }) => (
                            <li key={title}>
                                <strong>{title}</strong> — {pct(density)}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-3">
                        The honest caveat: if all 300 candidates fail, the generator returns the
                        first one it drew rather than failing outright — an unchecked board,
                        indistinguishable from a real one while you are playing it. That is why the
                        density ceiling exists. Custom boards can be built up to 32 by 16 with any
                        mine count under half the grid; push the density past the presets and you
                        are outside the measured range, where the guarantee is best-effort rather
                        than reliable.
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

                {/* Rescued from the how-to-play dialog the header replaced,
                    where it sat behind an unlabelled icon. */}
                <section>
                    <h2 className="text-pixel-md font-bold">Something missing?</h2>
                    <p className="mt-3">
                        Suggestions for new features are welcome —{' '}
                        <a
                            href="https://forms.gle/ALpScH8K7K2QsA8M7"
                            target="_blank"
                            rel="noopener noreferrer">
                            fill out this form
                        </a>.
                    </p>
                </section>
            </ProsePage>
        </>
    );
}
