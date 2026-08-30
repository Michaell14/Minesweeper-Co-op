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
];

const ICON_SIZE = 24;

/**
 * The site header — the only navigation, on every route.
 *
 * It replaced a cluster of unlabelled icons floated over the bottom-right of
 * `/` and `/daily`, which is why this is STATIC rather than sticky: the game's
 * mobile HUD is already `sticky top-0`, and a second sticky layer would either
 * cover it or owe it a coordinated offset forever.
 */
export default function SiteNav() {
    const pathname = usePathname();
    const { status } = useSession();
    const { profile } = useAccountProfile();
    const avatarId = profile?.avatar ?? null;

    /*
     * Starts false so the first client render matches SSR — the dot pops in
     * after mount. Mounted once in the layout, so this re-runs on every
     * client-side navigation: landing on /changelog is what marks it seen.
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
        // Seen-state is shared across tabs; the event fires only in OTHER tabs
        // and only on real changes, so this cannot loop.
        window.addEventListener('storage', refresh);
        return () => window.removeEventListener('storage', refresh);
    }, [pathname]);

    return (
        <header className="border-b-pixel border-edge bg-surface-panel">
            <nav
                aria-label="Main"
                className="mx-auto flex w-full max-w-[1350px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">

                <Link
                    href="/"
                    className={`order-1 text-pixel-sm whitespace-nowrap ${pointerClass}`}>
                    Minesweeper Co-op
                </Link>

                {/* Right on both layouts; on mobile that is row one, beside the
                    brand, with the links wrapping underneath. */}
                <div className="order-2 ml-auto flex items-center gap-4 sm:order-3">
                    <Link
                        href="/changelog"
                        aria-label="What's new"
                        className={`relative inline-block ${pointerClass}`}>
                        <StarIcon size={ICON_SIZE} />
                        {/* Square and unrounded — a round dot reads as
                            anti-aliasing next to pixel icons. */}
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
                      * Only KNOWN-signed-out gets the dialog button. Treating a
                      * still-resolving session as signed out flashes a sign-in
                      * control at every signed-in player on every load.
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
                    rather than stacking. Four items do not earn a drawer. */}
                <ul className="order-3 flex w-full items-center gap-4 overflow-x-auto sm:order-2 sm:w-auto sm:gap-5">
                    {LINKS.map(([target, label]) => (
                        <li key={target}>
                            <Link
                                href={target}
                                // Exact match: '/' is a prefix of every route,
                                // so prefix-matching lights Play up forever.
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
