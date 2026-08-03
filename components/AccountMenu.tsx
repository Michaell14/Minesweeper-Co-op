'use client'
import React from 'react';
import { useRouter } from 'next/navigation';
import { getProviders, signIn, signOut, useSession } from 'next-auth/react';
import { Button, Dialog, DialogClose, Field, Input } from '@/components/ds';
import { DIALOGS, closeDialog, openDialog } from '@/lib/dialogs';
import { clearBridgeToken } from '@/lib/authBridge';
import {
    deleteAccount,
    fetchProfile,
    ProfileApiError,
    updateDisplayName,
    type ProfileUser,
} from '@/lib/profileApi';

/**
 * The account dialogs: sign in, the signed-in profile (rename, sign out,
 * delete), the delete confirmation, and the privacy note. Mounted by Footer,
 * which owns the button that opens the first one.
 *
 * Sign-in and sign-out are full-page OAuth redirects, so there is no state to
 * reconcile afterwards — the app reloads and the socket reconnects with (or
 * without) the bridge token. What IS managed here is everything between:
 * loading the profile, the rename round-trip, and deletion.
 */

type ProviderInfo = { id: string; name: string };

/** Provider ids rendered for humans. Falls back to the raw id. */
const PROVIDER_LABELS: Record<string, string> = {
    github: 'GitHub',
    google: 'Google',
};
const providerLabel = (id: string) => PROVIDER_LABELS[id] ?? id;

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

    // The account row from the game server. 'unavailable' covers everything
    // from "Postgres not provisioned" to "Heroku is down" — states the player
    // can do nothing about beyond trying later.
    const [profile, setProfile] = React.useState<ProfileUser | null>(null);
    const [profileState, setProfileState] = React.useState<'loading' | 'ready' | 'unavailable'>('loading');
    const [nameDraft, setNameDraft] = React.useState('');
    React.useEffect(() => {
        if (status !== 'authenticated') {
            setProfile(null);
            return;
        }
        let cancelled = false;
        setProfileState('loading');
        fetchProfile().then((user) => {
            if (cancelled) return;
            setProfile(user);
            setProfileState(user ? 'ready' : 'unavailable');
            if (user) setNameDraft(user.displayName);
        });
        return () => { cancelled = true; };
    }, [status]);

    const [saving, setSaving] = React.useState(false);
    const [saved, setSaved] = React.useState(false);
    const [saveError, setSaveError] = React.useState<string | null>(null);

    const saveName = async () => {
        if (saving) return;
        setSaved(false);
        setSaveError(null);
        setSaving(true);
        try {
            const user = await updateDisplayName(nameDraft);
            setProfile(user);
            setNameDraft(user.displayName);
            setSaved(true);
        } catch (error) {
            setSaveError(
                error instanceof ProfileApiError ? error.message : 'Could not save right now',
            );
        } finally {
            setSaving(false);
        }
    };

    const [deleting, setDeleting] = React.useState(false);
    const [deleteError, setDeleteError] = React.useState<string | null>(null);

    const confirmDelete = async () => {
        if (deleting) return;
        setDeleteError(null);
        setDeleting(true);
        const ok = await deleteAccount();
        if (ok) {
            // The account row is gone; end the session too. Redirect closes
            // every dialog by replacing the page.
            clearBridgeToken();
            await signOut({ callbackUrl: '/' });
            return;
        }
        setDeleting(false);
        setDeleteError('Could not delete the account right now — try again in a minute.');
    };

    const handleSignOut = () => {
        clearBridgeToken();
        void signOut({ callbackUrl: '/' });
    };

    return (
        <>
            <Dialog
                id={DIALOGS.account}
                title="Account"
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
                        <DialogClose aria-label="Close account dialog">Close</DialogClose>
                    </>
                }>
                {status === 'loading' && <p className="text-pixel-sm text-ink-muted">Loading…</p>}

                {status === 'unauthenticated' && (
                    <>
                        <p className="text-pixel-sm">
                            Sign in to keep your name — and soon your stats, settings and
                            themes — on every device.
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

                {status === 'authenticated' && profileState === 'loading' && (
                    <p className="text-pixel-sm text-ink-muted">Loading your account…</p>
                )}

                {status === 'authenticated' && profileState === 'unavailable' && (
                    <>
                        <p className="text-pixel-sm">
                            You are signed in, but your account could not be loaded right
                            now. Games still work — try again in a minute.
                        </p>
                        <Button size="sm" onClick={handleSignOut}>Sign out</Button>
                    </>
                )}

                {status === 'authenticated' && profileState === 'ready' && profile && (
                    <>
                        <p className="text-pixel-sm text-ink-muted">
                            Signed in with {providerLabel(profile.provider)}
                            {profile.email ? ` as ${profile.email}` : ''}
                        </p>

                        <Field
                            label="Display name"
                            invalid={saveError !== null}
                            errorText={saveError}>
                            <div className="flex gap-3 items-start">
                                <Input
                                    aria-label="Display name"
                                    value={nameDraft}
                                    maxLength={16}
                                    onChange={(e) => {
                                        setNameDraft(e.target.value);
                                        setSaved(false);
                                    }}
                                    onKeyDown={(e) => {
                                        // Enter would submit the dialog's own
                                        // method="dialog" form — closing it
                                        // without saving. Save instead.
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            void saveName();
                                        }
                                    }}
                                />
                                <Button intent="primary" onClick={() => void saveName()} disabled={saving}>
                                    {saving ? 'Saving…' : 'Save'}
                                </Button>
                            </div>
                            {saved && (
                                <p role="status" className="text-pixel-sm text-ink-muted">Saved!</p>
                            )}
                        </Field>

                        <div className="flex gap-3 mt-4">
                            {/* The dialog outlives route changes (it lives in the
                                layout), so close it before navigating. */}
                            <Button
                                size="sm"
                                onClick={() => {
                                    closeDialog(DIALOGS.account);
                                    router.push('/profile');
                                }}>
                                Profile
                            </Button>
                            <Button size="sm" onClick={handleSignOut}>Sign out</Button>
                            <Button
                                size="sm"
                                intent="error"
                                onClick={() => {
                                    setDeleteError(null);
                                    closeDialog(DIALOGS.account);
                                    openDialog(DIALOGS.accountDelete);
                                }}>
                                Delete account…
                            </Button>
                        </div>
                    </>
                )}
            </Dialog>

            <Dialog
                id={DIALOGS.accountDelete}
                title="Delete your account?"
                alert
                className="max-w-lg"
                actionsAlign="between"
                actions={
                    <>
                        <DialogClose aria-label="Keep my account">Cancel</DialogClose>
                        <Button intent="error" onClick={() => void confirmDelete()} disabled={deleting}>
                            {deleting ? 'Deleting…' : 'Delete forever'}
                        </Button>
                    </>
                }>
                <p className="text-pixel-sm">
                    This permanently deletes your account and everything stored with it.
                    There is no undo and nothing is kept.
                </p>
                <p className="text-pixel-sm text-ink-muted">
                    Records saved in this browser (like personal bests) stay on this
                    device.
                </p>
                {deleteError && (
                    <p role="alert" className="text-pixel-sm">{deleteError}</p>
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
                    Signing in stores exactly three things on our server: the id your
                    OAuth provider gives us, the email address it reports, and your
                    display name. Game results will join them when profiles gain stats.
                    Nothing is shared with anyone else, and there is no advertising or
                    tracking attached to any of it.
                </p>
                <p className="text-pixel-sm">
                    Deleting your account (Account → Delete account) removes all of it
                    immediately and permanently.
                </p>
            </Dialog>
        </>
    );
}
