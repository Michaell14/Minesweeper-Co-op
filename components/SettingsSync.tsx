'use client'
import React from 'react';
import { useSession } from 'next-auth/react';
import { useMinesweeperStore } from '@/app/store';
import { fetchSettings, saveSettings } from '@/lib/settingsApi';
import { deleteThemeRemote, fetchThemes, saveThemeRemote } from '@/lib/themesApi';
import { clearPendingThemeDeletion, readPendingThemeDeletions } from '@/lib/customThemes';
import { installSoundUnlock } from '@/lib/sound';
import { msUntilLocalMidnight } from '@/lib/holidays';

/**
 * Renders nothing; owns the settings lifecycle. Mounted once in the layout.
 * Hydrates the store from localStorage after mount (reading it during render
 * is a hydration mismatch). On sign-in SERVER WINS — the account's settings
 * were curated across devices — unless the server has nothing, in which case
 * the local copy seeds it. While signed in, every local change is pushed
 * after a debounce: LAST WRITE WINS. Signed out, localStorage is the whole story.
 */

const PUSH_DEBOUNCE_MS = 800;

export default function SettingsSync() {
    const { status } = useSession();
    const hydrateSettings = useMinesweeperStore((s) => s.hydrateSettings);
    const replaceSettings = useMinesweeperStore((s) => s.replaceSettings);

    // What the server last agreed with, so a pull does not echo itself back up.
    const lastSynced = React.useRef<string | null>(null);

    React.useEffect(() => {
        hydrateSettings();
        // The audio context must be unlocked by the FIRST user gesture, wherever
        // it lands, or server-initiated sounds stay silent.
        installSoundUnlock();
    }, [hydrateSettings]);

    /*
     * Keeps a long-lived tab in step with the calendar: a holiday window can
     * only turn over at local midnight, so ONE timer is armed at a time. The
     * visibility listener catches the boundary a throttled or sleeping
     * background timer missed; `refreshSeasonal` is a no-op when nothing moved.
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

        // Custom themes merge rather than server-wins: they are a COLLECTION,
        // so neither side may erase the other's. On an id collision the server
        // wins; local-only ones are pushed up. Deletions replay FIRST, or the
        // server copy would resurrect a theme tombstoned offline (lib/customThemes.ts).
        fetchThemes().then(async (serverThemes) => {
            if (cancelled || serverThemes === null) return;

            for (const id of readPendingThemeDeletions()) {
                const ok = await deleteThemeRemote(id);
                if (ok) clearPendingThemeDeletion(id);
            }
            // Ids whose replay failed stay out of the merge, so they cannot resurrect locally.
            const tombstoned = new Set(readPendingThemeDeletions());
            const survivors = serverThemes.filter((t) => !tombstoned.has(t.id));

            const state = useMinesweeperStore.getState();
            const serverIds = new Set(survivors.map((t) => t.id));
            const localOnly = state.customThemes.filter((t) => !serverIds.has(t.id));
            state.replaceCustomThemes([...survivors, ...localOnly]);
            for (const theme of localOnly) void saveThemeRemote(theme);
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
