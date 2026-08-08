import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import ProsePage from "@/components/marketing/ProsePage";
import { DIFFICULTY_LEVELS, MAX_SAFE_DENSITY } from "@/shared/boardConfig";

const TITLE = "No-Guess Minesweeper — How the Solvable Boards Are Generated";
const DESCRIPTION =
    "Every board here is checked for logical solvability before you see it, so a loss is a mistake and never a 50/50. How the generator works, and the measured density ceiling it hits.";

/** Own canonical — see the note in app/daily/page.tsx for what inheriting costs. */
export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/no-guess-minesweeper` },
    openGraph: {
        type: "article",
        url: `${SITE_URL}/no-guess-minesweeper`,
        title: TITLE,
        description: DESCRIPTION,
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

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

export default function NoGuessPage() {
    return (
        <ProsePage
            title="No-Guess Minesweeper"
            lede="Classic Minesweeper will eventually deal you a position where two cells are equally likely to be the mine and nothing on the board can tell them apart. Losing there is a coin flip, not a mistake. These boards are built so that never happens."
            cta={{ href: "/", label: "Play a no-guess board" }}>
            <section>
                <h2 className="text-pixel-md font-bold">What &ldquo;no guess&rdquo; actually means</h2>
                <p className="mt-3">
                    It does not mean the board is easy, and it does not mean you cannot lose. It
                    means that at every point in the game there is at least one cell you can prove
                    is safe using only what the board is showing you. If you lose, you missed
                    something — the deduction was there.
                </p>
                <p className="mt-3">
                    That is a stronger guarantee than it sounds. Most Minesweeper implementations
                    place mines at random and hand you whatever comes out, and at expert density a
                    meaningful share of those layouts contain a position that no amount of
                    reasoning can resolve.
                </p>
            </section>

            <section>
                <h2 className="text-pixel-md font-bold">How the generator works</h2>
                <p className="mt-3">
                    Nothing is generated until your first click, which is what makes the opening
                    move safe: the cell you clicked and the eight around it are excluded from mine
                    placement, so the first click always opens a region rather than a single
                    number.
                </p>
                <p className="mt-3">
                    Then it is generate-and-test. A candidate layout is drawn at random, and a
                    solver plays it the way a careful person would — only ever taking moves it can
                    prove, never guessing. If the solver clears the board, you get that layout. If
                    it gets stuck, the candidate is thrown away and another is drawn. Up to 300
                    candidates are tried before the generator gives up.
                </p>
                <p className="mt-3">
                    The solver is the honest part of this. It is not checking that the board looks
                    reasonable; it is checking that a complete chain of deductions exists from the
                    opening cascade to the last safe cell.
                </p>
            </section>

            <section>
                <h2 className="text-pixel-md font-bold">Why the hardest setting stops where it does</h2>
                <p className="mt-3">
                    Solvable layouts get rare fast as mine density climbs, and the rate was measured
                    rather than guessed at. On a 20x16 board, the share of random candidates the
                    solver can clear:
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-6">
                    {SOLVABLE_RATES.map(({ density, rate }) => (
                        <li key={density}>
                            {density} density — <strong>{rate}</strong> of candidates are solvable
                        </li>
                    ))}
                </ul>
                <p className="mt-3">
                    At 300 attempts, {pct(MAX_SAFE_DENSITY)} never once fell through to an unchecked
                    board across 200 games on every board size. {SOLVABLE_RATES[2].density} still
                    did. So {pct(MAX_SAFE_DENSITY)} is where the hardest difficulty sits — not
                    because it felt right, but because it is the densest board the guarantee
                    survives.
                </p>
                <p className="mt-3">
                    That figure is also exactly classic Minesweeper&apos;s Expert density, 99 mines
                    on a 30x16 grid. The hardest setting here is as dense as Expert, and solvable
                    all the way through.
                </p>
            </section>

            <section>
                <h2 className="text-pixel-md font-bold">The four densities</h2>
                <p className="mt-3">
                    Difficulty is a mine density rather than a fixed count, applied to whichever
                    board size you pick — so a small hard board and a large easy one are both
                    available, and the mine count is always derived from the two.
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-6">
                    {DIFFICULTY_LEVELS.map(({ title, density }: { title: string; density: number }) => (
                        <li key={title}>
                            <strong>{title}</strong> — {pct(density)}
                        </li>
                    ))}
                </ul>
            </section>

            <section>
                <h2 className="text-pixel-md font-bold">The honest caveat</h2>
                <p className="mt-3">
                    If all 300 candidates fail, the generator returns the first one it drew rather
                    than failing outright — an unchecked board, indistinguishable from a real one
                    while you are playing it. That is why the density ceiling exists and why raising
                    it is guarded by a test rather than left to judgement: the failure mode here is
                    silent, so the only safe place to sit is well inside the measured margin.
                </p>
                <p className="mt-3">
                    Custom boards can be built up to 32 by 16 with any mine count under half the
                    grid. Push the density past the presets and you are outside the measured range,
                    where the guarantee is best-effort rather than reliable.
                </p>
            </section>

            <section>
                <h2 className="text-pixel-md font-bold">Where it matters most</h2>
                <p className="mt-3">
                    The <Link href="/daily">daily challenge</Link> — everyone plays the identical
                    board and is ranked by time, so a forced guess would decide the leaderboard at
                    random. Same for a 1v1 race: two players on the same layout should be separated
                    by who reads it faster, not by who called the coin flip.{" "}
                    <Link href="/how-to-play">The rules and chording</Link> are worth a read if you
                    are new.
                </p>
            </section>
        </ProsePage>
    );
}
