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

const KEY_BINDINGS: [string, string][] = [
    ['Arrows / WASD', 'Move the cursor'],
    ['Space / Enter', 'Reveal a cell'],
    ['F', 'Flag a cell'],
    ['Esc', 'Hide the cursor'],
];

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
                /*
                 * One max-width, not `max-w-2xl` plus a cap: a bare `max-w-2xl`
                 * REPLACES the UA's viewport-relative max-width, so the dialog
                 * ran 491px wide on a 375px screen with the right-hand words
                 * off the edge.
                 */
                className="max-w-[min(42rem,calc(100vw-2rem))]"
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
                {/*
                  * The number is its own flex item so a step that wraps indents
                  * under its own text. Run together in one <p>, "1) Create a
                  * room code (Can be / anything you want)" wrapped back to the
                  * left margin and read as a fourth step.
                  */}
                <ol className="grid gap-3">
                    {[
                        'Create a room code — it can be anything you want',
                        'Share your room code with friends',
                        'Play together!',
                    ].map((step, index) => (
                        <li key={step} className="flex gap-2 leading-6">
                            <span className="shrink-0 text-ink-muted">{index + 1})</span>
                            <span>{step}</span>
                        </li>
                    ))}
                </ol>

                <hr className="my-5 border-edge-muted" />

                <p className="text-pixel-sm text-ink-muted mb-3">KEYBOARD</p>
                {/*
                  * Wraps rather than a two-column grid. `Arrows / WASD` is 13em
                  * of a fixed-width pixel face, which on a phone leaves the
                  * action about eight characters wide — `Move the cursor` came
                  * out three words tall. Flex-basis on both means the action
                  * drops to its own full-width line instead.
                  */}
                <dl className="grid gap-2 text-pixel-sm">
                    {KEY_BINDINGS.map(([keys, action]) => (
                        <div key={keys} className="flex flex-wrap gap-x-5">
                            <dt className="basis-[13em]">{keys}</dt>
                            <dd className="grow basis-[10em] text-ink-muted">{action}</dd>
                        </div>
                    ))}
                </dl>

                <hr className="my-5 border-edge-muted" />

                {/*
                  * Real links, not more dialog copy. This dialog is mounted on
                  * every route, so these are the internal links that keep the
                  * content pages from being reachable only through the sitemap
                  * — which is barely reachable at all.
                  */}
                <div className="grid gap-2 text-pixel-sm">
                    <Link href="/how-to-play">Full rules and chording</Link>
                    <Link href="/no-guess-minesweeper">Why these boards never need a guess</Link>
                    <Link href="/daily">Today&apos;s daily challenge</Link>
                </div>
            </Dialog>

            <AccountMenu />
        </>
    )
}
