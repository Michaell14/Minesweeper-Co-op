'use client';

import React from 'react';
import { SpriteDefs } from '@/components/ds/sprites';
import { useMinesweeperStore } from '@/app/store';

/**
 * Mounts the sprite art with the player's pin from the store. This wiring
 * lives here rather than in SpriteDefs so the ds primitive stays store-free —
 * same split as SettingsSync.
 */
export default function SpriteDefsHost() {
    const spriteSet = useMinesweeperStore((s) => s.settings.spriteSet);
    return <SpriteDefs pinned={spriteSet} />;
}
