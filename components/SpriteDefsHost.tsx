'use client';

import React from 'react';
import { SpriteDefs } from '@/components/ds/sprites';
import { useMinesweeperStore } from '@/app/store';
import { readStoredSettings } from '@/lib/settings';

/**
 * Mounts the sprite art with the player's pin from the store. This wiring
 * lives here rather than in SpriteDefs so the ds primitive stays store-free —
 * same split as SettingsSync.
 *
 * The store hydrates in a post-paint effect, so waiting for it would paint a
 * returning player's first frame with follow-the-palette art. The stored pin
 * is read here in a LAYOUT effect instead: after hydration (so the server
 * markup matches) but before paint (so the wrong pair is never shown).
 *
 * A pin changed on ANOTHER device still repaints when the server sync lands —
 * deliberately. That value cannot be known before a network round trip, and
 * it is the same server-wins contract the theme has (lib/settings.ts).
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
