'use client'
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { DIALOGS, openDialog } from '@/lib/dialogs';
import { CoinIcon, Dialog, DialogClose, GearIcon, GithubIcon, StarIcon, UserIcon, UserSignedInIcon, pointerClass } from '@/components/ds';
import AccountMenu from '@/components/AccountMenu';
import { useMinesweeperStore } from '@/app/store';
import { hasUnseenEntries, markChangelogSeen } from '@/lib/changelog';

export default function Footer() {
    const playerJoined = useMinesweeperStore((s) => s.playerJoined);
    const dailyActive = useMinesweeperStore((s) => s.dailyActive);
    const { status } = useSession();

    const openGuideDialog = () => openDialog(DIALOGS.guide);
    const openAccountDialog = () => openDialog(DIALOGS.account);

    /*
     * The changelog badge. Starts false so the first client render matches
     * SSR (no hydration mismatch — the dot pops in after mount, fine for a
     * notification). The Footer is mounted once in the layout, so the effect
     * re-fires on every client-side navigation: landing on /changelog is what
     * marks it seen, whether the player clicked the star or a direct link.
     */
    const [hasUnseen, setHasUnseen] = useState(false);

    /*
     * The floating cluster belongs to the GAME page only: it is absolutely
     * positioned over the content column, so on any long document page
     * (/settings, /profile, whatever comes next) it overlaps the controls —
     * which is exactly how it shipped overlapping /settings' switches, got
     * fixed there, and then shipped overlapping /profile. Root-only is the
     * rule that cannot repeat that. The DIALOGS below stay mounted on every
     * route: other pages open the account dialog imperatively.
     */
    const pathname = usePathname();
    const showCluster = pathname === '/' || pathname === '/daily';

    useEffect(() => {
        const refreshUnseenState = () => {
            if (pathname === '/changelog') {
                markChangelogSeen();
                setHasUnseen(false);
            } else {
                setHasUnseen(hasUnseenEntries());
            }
        };

        refreshUnseenState();
        /*
         * Seen-state is shared across tabs (that is why it is localStorage),
         * so reading the changelog in one tab should clear the dot in the
         * rest. The storage event fires only in OTHER tabs and only on real
         * value changes, so this cannot loop.
         */
        window.addEventListener('storage', refreshUnseenState);
        return () => window.removeEventListener('storage', refreshUnseenState);
    }, [pathname]);

    /*
     * Floating is for the LANDING page only. Absolutely positioned, the
     * cluster anchors to the first viewport of the document — which at
     * ~1300px widths is exactly where a wide board's bottom-right cells are,
     * and icons over cells are cells nobody can click. With a game mounted
     * (room or daily) the cluster joins normal flow below the board instead,
     * matching what every sub-xl screen already does.
     *
     * Pinned to '/' as well as the two flags: /daily is a page of prose until
     * the player opts in, and floating over prose is how this landed on top of
     * /settings' switches once already.
     */
    const floating = pathname === '/' && !playerJoined && !dailyActive;

    return (
        <>
            {showCluster && <div className={
                floating
                    ? "xl:absolute mr-8 mb-6 xl:ml-0 xl:mb-0 float-right right-8 bottom-8 flex items-center gap-3"
                    : "mr-8 mb-6 float-right flex items-center gap-3"
            }>
                <a
                    href="https://github.com/Michaell14/Minesweeper-Co-op"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View this project on GitHub"
                    className={pointerClass}>
                    <GithubIcon size={48} />
                </a>
                {/*
                  * Was an <i> carrying an onClick: not focusable, not reachable
                  * by keyboard, and announced as nothing. It opens a dialog, so
                  * it is a button.
                  */}
                <button
                    type="button"
                    onClick={openGuideDialog}
                    aria-label="How to play"
                    className={pointerClass}>
                    <CoinIcon size={48} />
                </button>
                {/*
                  * Signed in, the user icon IS the profile: it links straight
                  * to /profile (tinted so the state is visible). While the
                  * session is still RESOLVING it links there too, untinted —
                  * the right destination for a signed-in player, a sign-in
                  * invite for a signed-out one — because treating "unknown"
                  * as signed-out would flash the wrong control at every
                  * signed-in player on every load. Only known-signed-out gets
                  * the dialog button.
                  */}
                {status === 'unauthenticated' ? (
                    <button
                        type="button"
                        onClick={openAccountDialog}
                        aria-label="Sign in"
                        className={pointerClass}>
                        <UserIcon size={48} />
                    </button>
                ) : (
                    <Link
                        href="/profile"
                        aria-label={status === 'authenticated' ? 'Profile' : 'Account'}
                        className={pointerClass}>
                        {status === 'authenticated'
                            ? <UserSignedInIcon size={48} />
                            : <UserIcon size={48} />}
                    </Link>
                )}
                <Link
                    href="/changelog"
                    aria-label="What's new"
                    className={`relative inline-block ${pointerClass}`}>
                    <StarIcon size={48} />
                    {/* Square and unrounded on purpose — a round dot reads as
                        anti-aliasing next to pixel icons. */}
                    {hasUnseen && (
                        <span
                            aria-hidden="true"
                            data-testid="changelog-unseen-dot"
                            className="absolute top-0 right-0 w-2.5 h-2.5 bg-error"
                        />
                    )}
                </Link>
                <Link href="/settings" aria-label="Settings" className={pointerClass}>
                    <GearIcon size={48} />
                </Link>
            </div>}

            <Dialog
                id={DIALOGS.guide}
                title="How to Play!"
                className="max-w-2xl"
                actionsAlign="between"
                actions={
                    <>
                        <div>
                            <p className="text-pixel-sm text-ink-muted">Suggestions for new features?</p>
                            <p className="text-pixel-sm text-ink-muted">
                                <a
                                    href="https://forms.gle/ALpScH8K7K2QsA8M7"
                                    target="_blank"
                                    rel="noopener noreferrer">
                                    Fill out this form
                                </a>
                            </p>
                        </div>
                        <DialogClose aria-label="Close how to play dialog">Cancel</DialogClose>
                    </>
                }>
                <p>1) Create a room code (Can be anything you want)</p>
                <p>2) Share your room code with friends</p>
                <p>3) Play together!</p>
                <hr />
                <p>Keyboard: arrows or WASD move the cursor</p>
                <p>Space/Enter reveals, F flags, Esc hides it</p>
                <hr />
                {/*
                  * Real links, not more dialog copy. This dialog is mounted on
                  * every route, so these are the internal links that keep the
                  * content pages from being reachable only through the sitemap
                  * — which is barely reachable at all.
                  */}
                <p className="text-pixel-sm">
                    <Link href="/how-to-play">Full rules and chording</Link>
                </p>
                <p className="text-pixel-sm">
                    <Link href="/no-guess-minesweeper">Why these boards never need a guess</Link>
                </p>
                <p className="text-pixel-sm">
                    <Link href="/daily">Today&apos;s daily challenge</Link>
                </p>
                <hr />
            </Dialog>

            <AccountMenu />
        </>
    )
}
