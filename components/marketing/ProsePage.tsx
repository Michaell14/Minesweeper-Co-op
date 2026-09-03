import React from "react";
import Link from "next/link";
// Straight from the file, not the barrel (the second sanctioned exception
// after Cell.tsx): this is a SERVER component, and the barrel re-exports
// RadioCard, whose module-level `createContext` throws when a server
// component imports it.
import ButtonLink from "@/components/ds/ButtonLink";

interface ProsePageProps {
    title: string;
    /** One or two sentences under the heading. Also the page's opening pitch. */
    lede: string;
    children: React.ReactNode;
    /** Where the page's main call to action goes, and what it says. */
    cta?: { href: string; label: string };
}

/**
 * The shell every content page wears: heading, readable body column, a call
 * to action, and links on to the other content pages. `ms-prose` switches body
 * copy off the global pixel face (app/globals.css); headings stay pixel. The
 * footer links are what get these pages crawled, and a new page gets them by
 * construction.
 */
export default function ProsePage({ title, lede, children, cta }: ProsePageProps) {
    return (
        <main className="ms-prose mx-auto w-full max-w-2xl px-4 py-10">
            <h1 className="text-pixel-xl md:text-pixel-2xl font-bold">{title}</h1>
            <p className="mt-6 text-body text-ink-muted">{lede}</p>

            <div className="mt-8 space-y-6 text-body">{children}</div>

            {cta && (
                <div className="mt-10 ms-pixel">
                    <ButtonLink href={cta.href} intent="primary" size="sm">
                        {cta.label}
                    </ButtonLink>
                </div>
            )}

            <nav aria-label="More about Minesweeper Co-op" className="mt-12 border-t border-edge-muted pt-6">
                <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
                    <li><Link href="/">Play Minesweeper Co-op</Link></li>
                    <li><Link href="/daily">Today&apos;s daily challenge</Link></li>
                    <li><Link href="/how-to-play">How to play</Link></li>
                    <li><Link href="/drills">Pattern drills</Link></li>
                    <li><Link href="/no-guess-minesweeper">No-guess boards</Link></li>
                </ul>
            </nav>
        </main>
    );
}
