'use client'
import React from 'react';
import { signOut } from 'next-auth/react';
import { Avatar, Button, Dialog, DialogClose, Field, Input, Panel, RadioCard, RadioCardGroup } from '@/components/ds';
import { AVATARS, canUseAvatar, requirementFor } from '@/shared/avatars';
import { ACHIEVEMENTS, isPending, metricsFrom, PENDING_NOTE, progressOf } from '@/shared/achievements';
import type { EarnedAchievement, ProfileStats } from '@/lib/statsApi';
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
 * Account management on /profile: identity, rename, sign out, and at the very
 * bottom, quietly, deletion. Deletion is a muted link and the confirm dialog
 * only arms once the display name is typed back: the one irreversible action
 * in the app gets real friction.
 */
export interface AccountPanelProps {
    /**
     * What this account has earned, for the locked avatars. Undefined while
     * stats are in flight or down; the panel renders without it so sign-out
     * stays reachable, and a gated face reads as locked until proven otherwise.
     */
    achievements?: EarnedAchievement[];
    /** For the progress under a locked face. Same source as the badge shelf. */
    stats?: ProfileStats;
}

export default function AccountPanel({ achievements, stats }: AccountPanelProps) {
    // 'unavailable' covers everything the player can do nothing about beyond trying later.
    const [profile, setProfile] = React.useState<ProfileUser | null>(null);
    const [profileState, setProfileState] = React.useState<'loading' | 'ready' | 'unavailable'>('loading');
    const [nameDraft, setNameDraft] = React.useState('');
    React.useEffect(() => {
        let cancelled = false;
        fetchProfile()
            .then((user) => {
                if (cancelled) return;
                setProfile(user);
                setProfileState(user ? 'ready' : 'unavailable');
                if (user) {
                    lastConfirmed.current = user;
                    setNameDraft(user.displayName);
                }
            })
            // 'loading' has no way out on its own and hides sign-out and deletion.
            .catch(() => { if (!cancelled) setProfileState('unavailable'); });
        return () => { cancelled = true; };
    }, []);

    const [saving, setSaving] = React.useState(false);
    const [saved, setSaved] = React.useState(false);
    const [saveError, setSaveError] = React.useState<string | null>(null);

    /*
     * Saves are SERIALISED by profileApi, so a response is always the newest
     * server state. `lastConfirmed` is what a failed pick reverts to (a snapshot
     * at click time could predate a queued rename), and `latestPick` lets a
     * superseded pick's outcome yield to the newer one's.
     */
    const lastConfirmed = React.useRef<ProfileUser | null>(null);
    const latestPick = React.useRef(0);

    const saveName = async () => {
        if (saving) return;
        setSaved(false);
        setSaveError(null);
        setSaving(true);
        try {
            const user = await updateDisplayName(nameDraft);
            lastConfirmed.current = user;
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

    /* The avatar saves on selection, optimistically; a refused save puts the old one back and says why. */
    const [avatarError, setAvatarError] = React.useState<string | null>(null);
    const saveAvatar = async (id: string) => {
        if (!profile || id === profile.avatar) return;
        const myPick = ++latestPick.current;
        setProfile({ ...profile, avatar: id });
        setAvatarError(null);
        try {
            const user = await updateAvatar(id);
            // Shown only while this is still the latest pick; a newer one's optimistic state stands.
            lastConfirmed.current = user;
            if (latestPick.current === myPick) setProfile(user);
        } catch (error) {
            // A newer pick owns the field; its own outcome governs.
            if (latestPick.current !== myPick) return;
            // The failed write changed nothing server-side, so the last confirmed profile is the truth.
            if (lastConfirmed.current) setProfile(lastConfirmed.current);
            setAvatarError(
                error instanceof ProfileApiError ? error.message : 'Could not save right now',
            );
        }
    };

    /* What each avatar costs, or null. `canUseAvatar` is the server's own rule, so the locks cannot drift. */
    const lockFor = React.useMemo(() => {
        const earned = (achievements ?? []).map((a) => a.id);
        const metrics = metricsFrom(stats);
        return (id: string): string | null => {
            if (canUseAvatar(id, { earned, current: profile?.avatar ?? null })) return null;
            const achievement = ACHIEVEMENTS.find((a) => a.id === requirementFor(id));
            // Unreachable while avatarUnlocks.test.js passes, but an achievement may be RETIRED.
            if (!achievement) return 'Locked';
            if (!stats) return achievement.description;
            // The badge shelf reads the same predicate and sentence, or the two read as two bugs.
            if (isPending(achievement, metrics)) {
                return `${achievement.description} ${PENDING_NOTE}`;
            }
            const progress = progressOf(achievement, metrics);
            return progress
                ? `${achievement.description} ${progress.value}/${progress.threshold}`
                : achievement.description;
        };
    }, [achievements, stats, profile?.avatar]);

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
            // End the session too; the redirect closes every dialog.
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
                                <Avatar id={profile.avatar} size={48} animated />
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
                                            // No form here; Enter saves as a convenience, like the button.
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
                                    {AVATARS.map(({ id, label }) => {
                                        const lock = lockFor(id);
                                        return (
                                            <RadioCard
                                                key={id}
                                                value={id}
                                                label={label}
                                                disabled={lock !== null}
                                                description={
                                                    <>
                                                        {/* The face is decoration; the requirement is not. */}
                                                        <span
                                                            aria-hidden="true"
                                                            className={lock ? 'opacity-50' : undefined}>
                                                            <Avatar id={id} size={40} animated={!lock} />
                                                        </span>
                                                        {lock && (
                                                            <span className="text-pixel-xs text-ink-muted">
                                                                {lock}
                                                            </span>
                                                        )}
                                                    </>
                                                }
                                            />
                                        );
                                    })}
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
                            // Enter would submit the method="dialog" form and cancel; arm-and-fire is click-only.
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
