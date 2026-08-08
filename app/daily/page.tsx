import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import DailyClient from "./DailyClient";

const TITLE = "Minesweeper Daily Challenge — One Board, Everyone, Every Day";
const DESCRIPTION =
    "One Minesweeper board a day, identical for every player, ranked by time. One attempt. No sign-up, no download — play today's puzzle in your browser.";

/**
 * Its own canonical, title and description, not inherited.
 *
 * Next merges metadata per top-level key, so a route that omits `alternates`
 * silently keeps the root layout's — which points at the homepage. On the
 * noindex routes that costs nothing; here it would tell Google this page is a
 * duplicate of `/` and drop it from the index, which is the opposite of why the
 * route exists.
 */
export const metadata: Metadata = {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/daily` },
    openGraph: {
        type: "website",
        url: `${SITE_URL}/daily`,
        title: TITLE,
        description: DESCRIPTION,
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * The daily challenge's own page.
 *
 * The prose below is the whole reason this is a route rather than a flag: it is
 * what a crawler and a first-time visitor both read before anything interactive
 * mounts. `DailyClient` swaps it for the board once the player opts in.
 */
export default function DailyPage() {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "Game",
                        name: "Minesweeper Daily Challenge",
                        description: DESCRIPTION,
                        url: `${SITE_URL}/daily`,
                        gamePlatform: ["Web Browser", "Desktop", "Mobile"],
                        genre: ["Puzzle", "Logic"],
                        numberOfPlayers: { "@type": "QuantitativeValue", minValue: 1, maxValue: 1 },
                        isPartOf: { "@type": "VideoGame", name: "Minesweeper Co-Op", url: SITE_URL },
                    }),
                }}
            />

            <DailyClient
                intro={
                    <main className="ms-prose mx-auto w-full max-w-2xl px-4 pt-10">
                        <h1 className="text-pixel-xl md:text-pixel-2xl font-bold">
                            Minesweeper Daily Challenge
                        </h1>

                        <p className="mt-6 text-body text-ink-muted">
                            One board a day. Everybody who plays today gets the identical layout, and
                            the leaderboard ranks you by how fast you clear it. You get one attempt.
                        </p>

                        <div className="mt-8 space-y-6 text-body">
                            <section>
                                <h2 className="text-pixel-md font-bold">How it works</h2>
                                <p className="mt-3">
                                    The day&apos;s board is generated from a seed derived from the
                                    date, so it is the same for every player in the world and cannot
                                    be rerolled. The clock starts on your first click, not when the
                                    page loads — read the rules first if you want to. It stops the
                                    moment the last safe cell opens.
                                </p>
                                <p className="mt-3">
                                    Hit a mine and the run is over. There is no retry: that is what
                                    makes a time worth comparing. Your attempt is tied to this
                                    browser rather than an account, so you can close the tab, come
                                    back, and pick the same board up where you left it.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-pixel-md font-bold">The leaderboard</h2>
                                <p className="mt-3">
                                    Finish and you can put a name to your time. The board resets at
                                    midnight UTC, and so does the leaderboard — today&apos;s ranking
                                    is only ever about today&apos;s puzzle.
                                </p>
                            </section>

                            <section>
                                <h2 className="text-pixel-md font-bold">No 50/50 guesses</h2>
                                <p className="mt-3">
                                    Every daily board is checked for logical solvability before it
                                    ships, so a loss is a mistake rather than a coin flip. That
                                    matters more here than anywhere else on the site: everyone is
                                    playing the same layout, and a forced guess would decide the
                                    leaderboard at random.{" "}
                                    <Link href="/no-guess-minesweeper">
                                        How the no-guess generator works
                                    </Link>
                                    .
                                </p>
                            </section>

                            <section>
                                <h2 className="text-pixel-md font-bold">New to Minesweeper?</h2>
                                <p className="mt-3">
                                    The <Link href="/how-to-play">rules and the chording shortcut</Link>{" "}
                                    take about two minutes to read and will save you more than that
                                    on the clock. If you would rather play with other people than
                                    against the clock, the{" "}
                                    <Link href="/">co-op and 1v1 modes</Link> are on the front page.
                                </p>
                            </section>
                        </div>
                    </main>
                }
            />
        </>
    );
}
