'use client'
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Avatar, GearIcon, GithubIcon, StarIcon, UserIcon, UserSignedInIcon, pointerClass } from '@/components/ds';
import { DIALOGS, openDialog } from '@/lib/dialogs';
import { hasUnseenEntries, markChangelogSeen } from '@/lib/changelog';
import { useAccountProfile } from '@/hooks/useAccountProfile';

/** The destinations, in the order they read. */
const LINKS: [href: string, label: string][] = [
    ['/', 'Play'],
    ['/daily', 'Daily'],
    ['/drills', 'Drills'],
    ['/how-to-play', 'How to play'],
    ['/no-guess-minesweeper', 'No-guess'],
];

const ICON_SIZE = 24;

/**
 * The site header, the only navigation. STATIC rather than sticky: the game's
 * mobile HUD is already `sticky top-0`, and a second layer would cover it or
 * owe it an offset forever.
 */
export default function SiteNav() {
    const pathname = usePathname();
    const { status } = useSession();
    const { profile } = useAccountProfile();
    const avatarId = profile?.avatar ?? null;

    /*
     * Starts false so the first client render matches SSR. Mounted once in the
     * layout, so this re-runs per navigation: landing on /changelog marks it seen.
     */
    const [hasUnseen, setHasUnseen] = React.useState(false);

    React.useEffect(() => {
        const refresh = () => {
            if (pathname === '/changelog') {
                markChangelogSeen();
                setHasUnseen(false);
            } else {
                setHasUnseen(hasUnseenEntries());
            }
        };

        refresh();
        // Seen-state is shared across tabs; the event fires only in OTHER tabs.
        window.addEventListener('storage', refresh);
        return () => window.removeEventListener('storage', refresh);
    }, [pathname]);

    return (
        <header className="border-b-pixel border-edge bg-surface-panel">
            <nav
                aria-label="Main"
                className="mx-auto flex w-full max-w-[1350px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:gap-x-6">

                {/* Short form below sm: the full wordmark wrapped to a third row on a phone. */}
                <Link
                    href="/"
                    aria-label="Minesweeper Co-op"
                    className={`order-1 text-pixel-sm whitespace-nowrap ${pointerClass}`}>
                    <span className="sm:hidden">Minesweeper</span>
                    <span className="hidden sm:inline">Minesweeper Co-op</span>
                </Link>

                {/* Right on both layouts; on mobile, row one beside the brand. */}
                <div className="order-2 ml-auto flex items-center gap-4 sm:order-3">
                    <Link
                        href="/changelog"
                        aria-label="What's new"
                        className={`relative inline-block ${pointerClass}`}>
                        <StarIcon size={ICON_SIZE} />
                        {/* Square: a round dot reads as anti-aliasing beside pixel icons. */}
                        {hasUnseen && (
                            <span
                                aria-hidden="true"
                                data-testid="changelog-unseen-dot"
                                className="absolute -top-1 -right-1 h-2 w-2 bg-error"
                            />
                        )}
                    </Link>

                    <Link href="/settings" aria-label="Settings" className={pointerClass}>
                        <GearIcon size={ICON_SIZE} />
                    </Link>

                    {/*
                      * Only KNOWN-signed-out gets the dialog button, or every
                      * signed-in player sees a sign-in control flash on load.
                      */}
                    {status === 'unauthenticated' ? (
                        <button
                            type="button"
                            onClick={() => openDialog(DIALOGS.account)}
                            aria-label="Sign in"
                            className={pointerClass}>
                            <UserIcon size={ICON_SIZE} />
                        </button>
                    ) : (
                        <Link
                            href="/profile"
                            aria-label={status === 'authenticated' ? 'Profile' : 'Account'}
                            className={pointerClass}>
                            {status === 'authenticated'
                                ? (avatarId
                                    ? <Avatar id={avatarId} size={ICON_SIZE} />
                                    : <UserSignedInIcon size={ICON_SIZE} />)
                                : <UserIcon size={ICON_SIZE} />}
                        </Link>
                    )}

                    <a
                        href="https://github.com/Michaell14/Minesweeper-Co-op"
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="GitHub"
                        className={pointerClass}>
                        <GithubIcon size={ICON_SIZE} />
                    </a>
                </div>

                {/* Full width on mobile so it wraps to its own line, scrolling
                    rather than stacking. Scrollbar hidden, not the overflow:
                    classic-scrollbar platforms charged the board 15px. */}
                <ul className="order-3 flex w-full items-center gap-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:order-2 sm:w-auto sm:gap-5">
                    {LINKS.map(([target, label]) => (
                        <li key={target}>
                            <Link
                                href={target}
                                // Exact match: '/' is a prefix of every route.
                                aria-current={pathname === target ? 'page' : undefined}
                                className={`text-pixel-xs whitespace-nowrap ${pathname === target ? '' : 'text-ink-muted'} hover:text-ink-muted-hover`}>
                                {label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
        </header>
    );
}
