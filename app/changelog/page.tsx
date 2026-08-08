import type { Metadata } from 'next';
import Link from 'next/link';
// Direct imports, not the ds barrel: this is a Server Component, and the
// barrel re-exports client-only modules (RadioCard calls createContext at
// module scope), which RSC refuses to load. Panel and Badge are pure.
import Panel from '@/components/ds/Panel';
import Badge, { type BadgeIntent } from '@/components/ds/Badge';
import { CHANGELOG, type ChangeTag } from '@/lib/changelog';

export const metadata: Metadata = {
    title: "Changelog — Minesweeper Co-op | What's New",
    description:
        "See what's new in Minesweeper Co-op: the latest features, improvements, and fixes to the free online multiplayer minesweeper game.",
    alternates: {
        // Without this the page inherits the layout's homepage canonical and
        // tells crawlers it is a duplicate of /.
        canonical: 'https://www.minesweepercoop.com/changelog',
    },
};

const TAG_INTENT: Record<ChangeTag, BadgeIntent> = {
    New: 'success',
    Improved: 'warning',
    Fixed: 'primary',
};

export default function ChangelogPage() {
    return (
        <div className="max-w-2xl mx-auto px-4 pt-4 lg:pt-8 pb-24">
            <div className="text-center">
                <h1 className="text-pixel-2xl md:text-pixel-4xl font-bold">What&apos;s New</h1>
            </div>
            <p className="mt-6 mb-8">
                <Link href="/" className="text-pixel-sm underline hover:text-ink-muted-hover">
                    &lt; Back to game
                </Link>
            </p>
            {CHANGELOG.map((entry) => (
                <Panel key={entry.id} title={entry.title} className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-pixel-xs text-ink-muted">{entry.date}</span>
                        <Badge intent={TAG_INTENT[entry.tag]}>{entry.tag}</Badge>
                    </div>
                    <ul className="list-disc pl-6">
                        {entry.bullets.map((bullet, i) => (
                            <li key={i} className="text-pixel-sm mb-2">{bullet}</li>
                        ))}
                    </ul>
                </Panel>
            ))}
        </div>
    );
}
