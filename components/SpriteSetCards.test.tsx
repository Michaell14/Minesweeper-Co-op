// @vitest-environment jsdom
/**
 * The sprite-set picker against the real store. What fails silently: a name
 * that stops resolving, a selection that stops writing, a seasonal set leaking
 * back into the options.
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import SpriteSetCards from './SpriteSetCards';
import { SPRITE_SET_IDS, SPRITE_SETS } from '@/components/ds/sprites';
import { useMinesweeperStore } from '@/app/store';
import { DEFAULT_SETTINGS } from '@/lib/settings';

beforeEach(() => {
    localStorage.clear();
    useMinesweeperStore.setState({
        settings: { ...DEFAULT_SETTINGS },
        settingsHydrated: true,
    });
});

afterEach(cleanup);

const group = () => screen.getByRole('radiogroup', { name: 'Mine and flag art' });

describe('the sprite-set picker', () => {
    it('offers every general set — and nothing seasonal', () => {
        render(<SpriteSetCards name="test-sprites" />);

        const radios = [...group().querySelectorAll('input[type=radio]')] as HTMLInputElement[];
        expect(radios).toHaveLength(SPRITE_SET_IDS.length);
        expect(screen.getByRole('radio', { name: /Classic/ })).toBeDefined();
        expect(screen.getByRole('radio', { name: /Naval/ })).toBeDefined();

        // The seasonal pairs arrive with their holiday; none is offered here.
        const values = radios.map((r) => r.value);
        for (const seasonal of Object.keys(SPRITE_SETS)) {
            expect(values).not.toContain(seasonal);
        }
    });

    // An unpinned blob is null, which resolves to the default pair; otherwise nothing is checked.
    it('shows Classic for a stored null — no pin is the default pair', () => {
        render(<SpriteSetCards name="test-sprites" />);

        expect(useMinesweeperStore.getState().settings.spriteSet).toBeNull();
        expect(
            (screen.getByRole('radio', { name: /Classic/ }) as HTMLInputElement).checked,
        ).toBe(true);
    });

    it('picking a set writes the pin to settings', () => {
        render(<SpriteSetCards name="test-sprites" />);

        fireEvent.click(screen.getByRole('radio', { name: /Naval/ }));

        expect(useMinesweeperStore.getState().settings.spriteSet).toBe('naval');
    });

    it('reflects the stored pin, and picking Classic writes back over it', () => {
        useMinesweeperStore.setState((state) => ({
            settings: { ...state.settings, spriteSet: 'space' },
        }));
        render(<SpriteSetCards name="test-sprites" />);

        expect(
            (screen.getByRole('radio', { name: /Space/ }) as HTMLInputElement).checked,
        ).toBe(true);

        fireEvent.click(screen.getByRole('radio', { name: /Classic/ }));

        expect(useMinesweeperStore.getState().settings.spriteSet).toBe('classic');
    });
});
