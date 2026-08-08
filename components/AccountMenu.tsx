'use client'
import React from 'react';
import { useRouter } from 'next/navigation';
import { getProviders, signIn, useSession } from 'next-auth/react';
import { Button, Dialog, DialogClose } from '@/components/ds';
import { DIALOGS, closeDialog, openDialog } from '@/lib/dialogs';
import { providerLabel } from '@/lib/profileApi';

/**
 * The sign-in and privacy dialogs, mounted on every route by Footer.
 *
 * This used to be the whole account surface — rename, sign out, delete. All
 * of that now lives on /profile (app/profile/AccountPanel.tsx): signed in,
 * the footer icon links straight there and this dialog is never the way in.
 * What remains is the one thing a signed-OUT player needs: the provider
 * buttons. Sign-in is a full-page OAuth redirect, so there is no state to
 * reconcile afterwards — the app reloads and the socket reconnects with the
 * bridge token.
 */

type ProviderInfo = { id: string; name: string };

export default function AccountMenu() {
    const { status } = useSession();
    const router = useRouter();

    // Which providers this deploy actually has, from NextAuth's own endpoint —
    // env vars are server-side, so the client asks rather than assumes.
    const [providers, setProviders] = React.useState<ProviderInfo[] | null>(null);
    React.useEffect(() => {
        if (status !== 'unauthenticated') return;
        let cancelled = false;
        getProviders().then((found) => {
            if (cancelled) return;
            setProviders(found ? Object.values(found).map(({ id, name }) => ({ id, name })) : []);
        });
        return () => { cancelled = true; };
    }, [status]);

    return (
        <>
            <Dialog
                id={DIALOGS.account}
                title="Sign in"
                className="max-w-lg"
                actionsAlign="between"
                actions={
                    <>
                        <Button
                            size="sm"
                            onClick={() => {
                                closeDialog(DIALOGS.account);
                                openDialog(DIALOGS.privacy);
                            }}>
                            Privacy
                        </Button>
                        <DialogClose aria-label="Close sign-in dialog">Close</DialogClose>
                    </>
                }>
                {status === 'loading' && <p className="text-pixel-sm text-ink-muted">Loading…</p>}

                {status === 'unauthenticated' && (
                    <>
                        <p className="text-pixel-sm">
                            Sign in to keep your name, stats, settings and themes on every
                            device.
                        </p>
                        {providers === null && (
                            <p className="text-pixel-sm text-ink-muted">Loading…</p>
                        )}
                        {providers?.length === 0 && (
                            <p className="text-pixel-sm text-ink-muted">
                                Sign-in is not set up on this deployment.
                            </p>
                        )}
                        {!!providers?.length && (
                            <div className="flex flex-col gap-3 mt-2">
                                {providers.map((p) => (
                                    <Button key={p.id} onClick={() => signIn(p.id)}>
                                        Sign in with {providerLabel(p.id)}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* Reachable only when the session flips while the dialog is
                    open — a sign-in finishing in another tab. A safety net
                    rather than a dead end, for exactly that case. */}
                {status === 'authenticated' && (
                    <>
                        <p className="text-pixel-sm">You are already signed in.</p>
                        <Button
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                                // The dialog outlives route changes (it lives in
                                // the layout), so close it before navigating.
                                closeDialog(DIALOGS.account);
                                router.push('/profile');
                            }}>
                            View your profile
                        </Button>
                    </>
                )}
            </Dialog>

            <Dialog
                id={DIALOGS.privacy}
                title="Privacy"
                className="max-w-lg"
                actions={<DialogClose aria-label="Close privacy dialog">Close</DialogClose>}>
                <p className="text-pixel-sm">
                    Signed out, nothing about you leaves this browser: your palette and
                    personal bests live in local storage here.
                </p>
                <p className="text-pixel-sm">
                    Signing in stores the id your OAuth provider gives us, the email
                    address it reports, your display name — and, as you play, your
                    settings, saved themes and the game results behind your private
                    stats. Nothing is shared with anyone else, and there is no
                    advertising or tracking attached to any of it.
                </p>
                <p className="text-pixel-sm">
                    Deleting your account (Profile → Delete account) removes all of it
                    immediately and permanently.
                </p>
            </Dialog>
        </>
    );
}
