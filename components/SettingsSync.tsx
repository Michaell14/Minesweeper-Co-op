'use client'
import React from 'react';
import { useSession } from 'next-auth/react';
import { useMinesweeperStore } from '@/app/store';
import { fetchSettings, saveSettings } from '@/lib/settingsApi';

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
    }, [hydrateSettings]);

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
