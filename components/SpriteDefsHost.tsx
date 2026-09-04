'use client';

import React from 'react';
import { SpriteDefs } from '@/components/ds/sprites';
import { useMinesweeperStore } from '@/app/store';
import { readStoredSettings } from '@/lib/settings';

/**
 * Mounts the sprite art with the player's pin from the store; the wiring lives
 * here so the ds primitive stays store-free, as with SettingsSync. The store
 * hydrates post-paint, so the stored pin is read in a LAYOUT effect: after
 * hydration (server markup matches) but before paint (the wrong pair is never
 * shown). A pin changed on ANOTHER device still repaints when the sync lands,
 * the same server-wins contract as the theme (lib/settings.ts).
 */
export default function SpriteDefsHost() {
    const hydrated = useMinesweeperStore((s) => s.settingsHydrated);
    const spriteSet = useMinesweeperStore((s) => s.settings.spriteSet);

    const [stored, setStored] = React.useState<string | null>(null);
    React.useLayoutEffect(() => {
        setStored(readStoredSettings().spriteSet);
    }, []);

    return <SpriteDefs pinned={hydrated ? spriteSet : stored} />;
}
