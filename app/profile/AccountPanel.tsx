'use client'
import React from 'react';
import { signOut } from 'next-auth/react';
import { Avatar, Button, Dialog, DialogClose, Field, Input, Panel, RadioCard, RadioCardGroup } from '@/components/ds';
import { AVATARS } from '@/shared/avatars';
import { DIALOGS, openDialog } from '@/lib/dialogs';
import { clearBridgeToken } from '@/lib/authBridge';
import {
    deleteAccount,
    fetchProfile,
    ProfileApiError,
    providerLabel,
    updateAvatar,
    updateDisplayName,
    type ProfileUser,
} from '@/lib/profileApi';

/**
 * Account management on /profile: who you are signed in as, the rename
 * control, sign out, and — at the very bottom, deliberately quiet — account
 * deletion. This used to live in the account dialog; now the dialog only
 * signs you in, and everything about a signed-in account lives here.
 *
 * Deletion is a muted text link, not a button in a row, and the confirm
 * dialog only arms once the display name is typed back: it is the one
 * irreversible action in the app, so it gets real friction.
 */
export default function AccountPanel() {
    // The account row from the game server. 'unavailable' covers everything
    // from "Postgres not provisioned" to "Heroku is down" — states the player
    // can do nothing about beyond trying later.
    const [profile, setProfile] = React.useState<ProfileUser | null>(null);
    const [profileState, setProfileState] = React.useState<'loading' | 'ready' | 'unavailable'>('loading');
    const [nameDraft, setNameDraft] = React.useState('');
    React.useEffect(() => {
        let cancelled = false;
        fetchProfile().then((user) => {
            if (cancelled) return;
            setProfile(user);
            setProfileState(user ? 'ready' : 'unavailable');
            if (user) setNameDraft(user.displayName);
        });
        return () => { cancelled = true; };
    }, []);

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

    /*
     * The avatar saves on selection, optimistically: the card lights at once,
     * and a refused/failed save puts the old one back and says why. A "Save"
     * button here would demote picking a face to a two-step form.
     */
    const [avatarError, setAvatarError] = React.useState<string | null>(null);
    const saveAvatar = async (id: string) => {
        if (!profile || id === profile.avatar) return;
        const previous = profile;
        setProfile({ ...profile, avatar: id });
        setAvatarError(null);
        try {
            setProfile(await updateAvatar(id));
        } catch (error) {
            setProfile(previous);
            setAvatarError(
                error instanceof ProfileApiError ? error.message : 'Could not save right now',
            );
        }
    };

    const [deleting, setDeleting] = React.useState(false);
    const [deleteError, setDeleteError] = React.useState<string | null>(null);
    const [confirmDraft, setConfirmDraft] = React.useState('');
    const confirmed = profile !== null && confirmDraft.trim() === profile.displayName;

    const confirmDelete = async () => {
        if (deleting || !confirmed) return;
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
            <section aria-labelledby="profile-account" className="mt-8">
                <Panel title={<span id="profile-account">Account</span>}>
                    {profileState === 'loading' && (
                        <p className="text-pixel-sm text-ink-muted">Loading your account…</p>
                    )}

                    {profileState === 'unavailable' && (
                        <>
                            <p className="text-pixel-sm">
                                You are signed in, but your account could not be loaded right
                                now. Games still work — try again in a minute.
                            </p>
                            <Button size="sm" className="mt-4" onClick={handleSignOut}>
                                Sign out
                            </Button>
                        </>
                    )}

                    {profileState === 'ready' && profile && (
                        <>
                            <div className="flex items-center gap-3">
                                <Avatar id={profile.avatar} size={48} />
                                <p className="text-pixel-sm text-ink-muted">
                                    Signed in with {providerLabel(profile.provider)}
                                    {profile.email ? ` as ${profile.email}` : ''}
                                </p>
                            </div>

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
                                            // No form here — Enter saves purely
                                            // as a convenience, like the button.
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

                            <div className="mt-4">
                                <p className="text-pixel-sm mb-2">Avatar</p>
                                <RadioCardGroup
                                    name="avatar"
                                    ariaLabel="Avatar"
                                    value={profile.avatar}
                                    onChange={(id) => void saveAvatar(id)}
                                    wrap>
                                    {AVATARS.map(({ id, label }) => (
                                        <RadioCard
                                            key={id}
                                            value={id}
                                            label={label}
                                            description={
                                                <span aria-hidden="true">
                                                    <Avatar id={id} size={40} />
                                                </span>
                                            }
                                        />
                                    ))}
                                </RadioCardGroup>
                                {avatarError && (
                                    <p role="alert" className="text-pixel-sm mt-2">{avatarError}</p>
                                )}
                            </div>

                            <div className="flex gap-3 mt-4">
                                <Button size="sm" onClick={handleSignOut}>Sign out</Button>
                                <Button
                                    size="sm"
                                    onClick={() => openDialog(DIALOGS.privacy)}>
                                    Privacy
                                </Button>
                            </div>
                        </>
                    )}
                </Panel>
            </section>

            {profileState === 'ready' && profile && (
                <p className="mt-12 text-center">
                    <button
                        type="button"
                        className="text-pixel-xs text-ink-muted underline hover:text-ink-muted-hover"
                        onClick={() => {
                            setConfirmDraft('');
                            setDeleteError(null);
                            openDialog(DIALOGS.accountDelete);
                        }}>
                        Delete account…
                    </button>
                </p>
            )}

            <Dialog
                id={DIALOGS.accountDelete}
                title="Delete your account?"
                alert
                className="max-w-lg"
                actionsAlign="between"
                actions={
                    <>
                        <DialogClose aria-label="Keep my account">Cancel</DialogClose>
                        <Button
                            intent="error"
                            onClick={() => void confirmDelete()}
                            disabled={deleting || !confirmed}>
                            {deleting ? 'Deleting…' : 'Delete forever'}
                        </Button>
                    </>
                }>
                <p className="text-pixel-sm">
                    This permanently deletes your account and everything stored with it —
                    stats, settings and themes. There is no undo and nothing is kept.
                </p>
                <p className="text-pixel-sm text-ink-muted">
                    Records saved in this browser (like personal bests) stay on this
                    device.
                </p>
                <Field label={`Type your display name (${profile?.displayName ?? ''}) to confirm`}>
                    <Input
                        aria-label="Type your display name to confirm"
                        value={confirmDraft}
                        maxLength={16}
                        onChange={(e) => setConfirmDraft(e.target.value)}
                        onKeyDown={(e) => {
                            // Enter would submit the dialog's method="dialog"
                            // form — cancelling. Arm-and-fire is click-only.
                            if (e.key === 'Enter') e.preventDefault();
                        }}
                    />
                </Field>
                {deleteError && (
                    <p role="alert" className="text-pixel-sm">{deleteError}</p>
                )}
            </Dialog>
        </>
    );
}
