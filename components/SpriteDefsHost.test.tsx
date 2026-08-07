// @vitest-environment jsdom
/**
 * The host's one non-obvious job: a returning player's pin must paint on the
 * FIRST frame. The store hydrates in a post-paint effect, so a host that only
 * read the store would draw follow-the-palette art for a frame — the sprite
 * version of the flash the theme's no-flash script exists to prevent.
 */
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { render, cleanup } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import SpriteDefsHost from './SpriteDefsHost';
import { SpriteDefs } from '@/components/ds/sprites';
import { useMinesweeperStore } from '@/app/store';
import { DEFAULT_SETTINGS, writeStoredSettings } from '@/lib/settings';

const mineArt = (container: HTMLElement) =>
    container.querySelector('symbol#ms-sprite-mine')!.innerHTML;

/** Reference render: what the given pin's art looks like. */
const artOf = (pinned: string | null) => {
    const { container, unmount } = render(<SpriteDefs pinned={pinned} />);
    const art = mineArt(container);
    unmount();
    return art;
};

beforeEach(() => {
    localStorage.clear();
    useMinesweeperStore.setState({
        settings: { ...DEFAULT_SETTINGS },
        settingsHydrated: false,
    });
});

afterEach(cleanup);

describe('before the store hydrates', () => {
    it('draws the STORED pin, not the store default', () => {
        writeStoredSettings({ ...DEFAULT_SETTINGS, spriteSet: 'naval' });

        const { container } = render(<SpriteDefsHost />);

        expect(mineArt(container)).toEqual(artOf('naval'));
    });

    it('with nothing stored, follows the palette as before', () => {
        const { container } = render(<SpriteDefsHost />);

        expect(mineArt(container)).toEqual(artOf(null));
    });

    /*
     * The WHEN, not just the WHAT. The pin must land in a LAYOUT effect —
     * before the browser paints — and RTL's act() flushes layout and passive
     * effects alike, so the tests above pass even with useEffect. jsdom never
     * paints, but the boundary is still observable: rendering under flushSync
     * runs layout effects inside the commit, while passive effects wait for a
     * task. Asserting synchronously after flushSync therefore fails on
     * useEffect — this is the one test that pins the fix itself.
     */
    it('applies the stored pin in the same commit, before any paint could happen', () => {
        writeStoredSettings({ ...DEFAULT_SETTINGS, spriteSet: 'naval' });
        const naval = artOf('naval');

        const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
        const actFlag = g.IS_REACT_ACT_ENVIRONMENT;
        g.IS_REACT_ACT_ENVIRONMENT = false; // deliberate: act() would flush the passive path too
        const container = document.body.appendChild(document.createElement('div'));
        const root = createRoot(container);
        try {
            flushSync(() => root.render(<SpriteDefsHost />));

            expect(mineArt(container)).toEqual(naval);
        } finally {
            flushSync(() => root.unmount());
            container.remove();
            g.IS_REACT_ACT_ENVIRONMENT = actFlag;
        }
    });
});

describe('once the store hydrates', () => {
    it('the store wins — a sync can change the pin under the stored value', () => {
        writeStoredSettings({ ...DEFAULT_SETTINGS, spriteSet: 'naval' });
        useMinesweeperStore.setState({
            settings: { ...DEFAULT_SETTINGS, spriteSet: 'space' },
            settingsHydrated: true,
        });

        const { container } = render(<SpriteDefsHost />);

        expect(mineArt(container)).toEqual(artOf('space'));
    });
});
