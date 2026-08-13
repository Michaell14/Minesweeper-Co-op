'use client'
import React from 'react';
import { useSession } from 'next-auth/react';
import { useMinesweeperStore } from '@/app/store';
import { fetchSettings, saveSettings } from '@/lib/settingsApi';
import { deleteThemeRemote, fetchThemes, saveThemeRemote } from '@/lib/themesApi';
import { clearPendingThemeDeletion, readPendingThemeDeletions } from '@/lib/customThemes';
import { fetchBests, importBests } from '@/lib/statsApi';
import { markBestsSynced, mergeServerBests } from '@/lib/bestTimes';
import { installSoundUnlock } from '@/lib/sound';
import { msUntilLocalMidnight } from '@/lib/holidays';

/**
 * Renders nothing; owns the settings lifecycle. Mounted once in the layout.
 *
 * 1. Hydrates the store from localStorage after mount (reading storage during
 *    render is a hydration mismatch).
 * 2. On sign-in, pulls the server copy — SERVER WINS at sign-in, because the
 *    account's settings are what the player curated across devices; a fresh
 *    browser's defaults must not overwrite them. If the server has nothing
 *    yet, the local copy is pushed instead (first sign-in seeds the mirror).
 * 3. While signed in, every local change is pushed after a short debounce —
 *    LAST WRITE WINS from then on. Two devices editing simultaneously settle
 *    on whoever saved last, which for a settings page is the right amount of
 *    conflict resolution.
 *
 * Signed out, only step 1 runs and localStorage is the whole story.
 */

const PUSH_DEBOUNCE_MS = 800;

export default function SettingsSync() {
    const { status } = useSession();
    const hydrateSettings = useMinesweeperStore((s) => s.hydrateSettings);
    const replaceSettings = useMinesweeperStore((s) => s.replaceSettings);

    // What the server last agreed with, as JSON — so the pull in step 2 does
    // not immediately echo itself back up through the subscription in step 3.
    const lastSynced = React.useRef<string | null>(null);

    React.useEffect(() => {
        hydrateSettings();
        // Piggybacks on the one always-mounted lifecycle component: the audio
        // context must be unlocked by the FIRST user gesture, wherever it
        // lands, or server-initiated sounds (a win, a teammate's cascade)
        // stay silent until the player happens to click after enabling sound.
        installSoundUnlock();
    }, [hydrateSettings]);

    /*
     * Keeps a long-lived tab in step with the calendar. A holiday window can
     * only open or close at local midnight, so this arms ONE timer at a time
     * rather than polling.
     *
     * The visibility listener is not redundant with it: background timers are
     * throttled to minutes and do not run at all across a sleep, which is
     * exactly the tab that sits open overnight. Re-resolving on the way back
     * catches the boundary the timer slept through, and `refreshSeasonal` is a
     * no-op when the answer has not moved.
     */
    React.useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;

        const tick = () => {
            useMinesweeperStore.getState().refreshSeasonal();
            timer = setTimeout(tick, msUntilLocalMidnight());
        };
        timer = setTimeout(tick, msUntilLocalMidnight());

        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            useMinesweeperStore.getState().refreshSeasonal();
            clearTimeout(timer);
            timer = setTimeout(tick, msUntilLocalMidnight());
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    React.useEffect(() => {
        // Mirrored for the win handlers, which are not components and cannot
        // ask useSession — see gameSlice.signedIn.
        useMinesweeperStore.getState().setSignedIn(status === 'authenticated');

        if (status !== 'authenticated') {
            lastSynced.current = null;
            return;
        }

        let cancelled = false;
        fetchSettings().then((server) => {
            if (cancelled) return;
            if (server) {
                lastSynced.current = JSON.stringify(server);
                replaceSettings(server);
            } else {
                const local = useMinesweeperStore.getState().settings;
                void saveSettings(local).then((ok) => {
                    if (ok) lastSynced.current = JSON.stringify(local);
                });
            }
        });

        // Custom themes: merge rather than server-wins — themes are a
        // COLLECTION, and a fresh browser having none must not erase the
        // account's shelf, nor sign-in discard what was drafted here. On an
        // id collision the server copy wins (it is the multi-device truth);
        // local-only ones are pushed up. Deletions replay FIRST: a theme
        // deleted while offline holds a tombstone (lib/customThemes.ts), and
        // without replaying it here the server copy would resurrect it.
        fetchThemes().then(async (serverThemes) => {
            if (cancelled || serverThemes === null) return;

            for (const id of readPendingThemeDeletions()) {
                const ok = await deleteThemeRemote(id);
                if (ok) clearPendingThemeDeletion(id);
            }
            // Still-pending ids (the replay itself failed) stay out of the
            // merge, so they cannot resurrect locally either.
            const tombstoned = new Set(readPendingThemeDeletions());
            const survivors = serverThemes.filter((t) => !tombstoned.has(t.id));

            const state = useMinesweeperStore.getState();
            const serverIds = new Set(survivors.map((t) => t.id));
            const localOnly = state.customThemes.filter((t) => !serverIds.has(t.id));
            state.replaceCustomThemes([...survivors, ...localOnly]);
            for (const theme of localOnly) void saveThemeRemote(theme);
        });

        // Best times: keep-if-faster in BOTH directions, like the themes merge
        // but symmetric — a record is a fact about a run, so neither side can
        // "win" a conflict; the faster time simply is the record. Server times
        // this browser lacks land in localStorage, scoped to the account they
        // came from (mergeServerBests evicts another account's on switch);
        // browser-earned records the account lacks are pushed up. New records
        // DURING play need no push here: the server records signed-in wins
        // itself (utils/statsRecorder), from its own clock.
        fetchBests().then(async (account) => {
            if (cancelled || account === null) return;
            const { changed, toPush } = mergeServerBests(account.bests, account.userId);
            if (changed) useMinesweeperStore.getState().bumpBestTimesVersion();
            if (toPush.length === 0) return;
            // Best-effort, like every push in this file: a miss is retried on
            // the next sign-in pass. importBests filters and caps to the
            // server's contract and reports what actually landed — which the
            // account then CLAIMS, so a guest run seeds the first account to
            // land it rather than every account to sign in after.
            const landed = await importBests(toPush);
            if (cancelled || landed === null) return;
            markBestsSynced(account.userId, landed.map((best) => best.boardKey));
        });

        return () => { cancelled = true; };
    }, [status, replaceSettings]);

    React.useEffect(() => {
        if (status !== 'authenticated') return;

        let timer: ReturnType<typeof setTimeout> | null = null;
        const unsubscribe = useMinesweeperStore.subscribe((state, prev) => {
            if (state.settings === prev.settings) return;
            const snapshot = JSON.stringify(state.settings);
            if (snapshot === lastSynced.current) return;

            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                void saveSettings(state.settings).then((ok) => {
                    if (ok) lastSynced.current = snapshot;
                });
            }, PUSH_DEBOUNCE_MS);
        });

        return () => {
            unsubscribe();
            if (timer) clearTimeout(timer);
        };
    }, [status]);

    return null;
}
