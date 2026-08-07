// @vitest-environment jsdom
/**
 * The sprite-set picker against the real store. What fails silently: a card
 * whose accessible name stops resolving, a selection that stops writing the
 * setting, a group that stops reflecting what the blob holds — or a seasonal
 * set leaking back into the options, which is the whole point of the split.
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
    it('offers every general set plus following the palette — and nothing seasonal', () => {
        render(<SpriteSetCards name="test-sprites" />);

        const radios = [...group().querySelectorAll('input[type=radio]')] as HTMLInputElement[];
        expect(radios).toHaveLength(SPRITE_SET_IDS.length + 1);
        expect(screen.getByRole('radio', { name: /Match palette/ })).toBeDefined();
        expect(screen.getByRole('radio', { name: /Classic/ })).toBeDefined();
        expect(screen.getByRole('radio', { name: /Naval/ })).toBeDefined();

        // The seasonal pairs arrive with their holiday; none is offered here.
        const values = radios.map((r) => r.value);
        for (const seasonal of Object.keys(SPRITE_SETS)) {
            expect(values).not.toContain(seasonal);
        }
    });

    it('starts on Match palette — the default and the old behaviour', () => {
        render(<SpriteSetCards name="test-sprites" />);

        expect(
            (screen.getByRole('radio', { name: /Match palette/ }) as HTMLInputElement).checked,
        ).toBe(true);
    });

    it('picking a set writes the pin to settings', () => {
        render(<SpriteSetCards name="test-sprites" />);

        fireEvent.click(screen.getByRole('radio', { name: /Naval/ }));

        expect(useMinesweeperStore.getState().settings.spriteSet).toBe('naval');
    });

    it('picking Match palette clears the pin back to null', () => {
        useMinesweeperStore.setState((state) => ({
            settings: { ...state.settings, spriteSet: 'space' },
        }));
        render(<SpriteSetCards name="test-sprites" />);

        expect(
            (screen.getByRole('radio', { name: /Space/ }) as HTMLInputElement).checked,
        ).toBe(true);

        fireEvent.click(screen.getByRole('radio', { name: /Match palette/ }));

        expect(useMinesweeperStore.getState().settings.spriteSet).toBeNull();
    });
});
