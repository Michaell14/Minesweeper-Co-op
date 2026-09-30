// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeStudio from './ThemeStudio';
import { useMinesweeperStore } from '@/app/store';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { CUSTOM_THEME_PREFIX, derivePalette, sanitizeCustomTheme } from '@/lib/customThemes';

vi.mock('@/lib/themesApi', () => ({
    saveThemeRemote: async () => true,
    deleteThemeRemote: async () => true,
}));

beforeEach(() => {
    localStorage.clear();
    useMinesweeperStore.setState({ customThemes: [] });
    useMinesweeperStore.getState().replaceSettings({ ...DEFAULT_SETTINGS, seasonalThemes: false, theme: 'dark' });
});

afterEach(() => { cleanup(); });

const changePreview = () => {
    fireEvent.click(screen.getByRole('button', { name: 'New theme' }));
    fireEvent.change(screen.getByLabelText('Accent colour'), { target: { value: '#123456' } });
    expect(document.documentElement.style.getPropertyValue('--ms-palette-blue')).toBe('#123456');
};

describe('theme preview lifecycle', () => {
    it('restores the saved palette when navigating away with an unsaved preview', () => {
        const view = render(<ThemeStudio />);
        changePreview();
        view.unmount();
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.style.getPropertyValue('--ms-palette-blue')).toBe('');
        expect(useMinesweeperStore.getState().customThemes).toEqual([]);
    });

    it('cancels a preview without changing the selected theme', () => {
        render(<ThemeStudio />);
        changePreview();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.style.getPropertyValue('--ms-palette-blue')).toBe('');
        expect(useMinesweeperStore.getState().settings.theme).toBe('dark');
    });

    it('keeps a newly saved custom palette applied when the editor closes and unmounts', () => {
        const view = render(<ThemeStudio />);
        changePreview();
        fireEvent.click(screen.getByRole('button', { name: /^Save/ }));
        const saved = useMinesweeperStore.getState().customThemes[0];
        expect(useMinesweeperStore.getState().settings.theme).toBe(`${CUSTOM_THEME_PREFIX}${saved.id}`);
        expect(saved.palette['--ms-palette-blue']).toBe('#123456');
        view.unmount();
        expect(document.documentElement.style.getPropertyValue('--ms-palette-blue')).toBe('#123456');
    });

    it('restores the latest selected palette rather than the selection when editing began', () => {
        const view = render(<ThemeStudio />);
        changePreview();
        act(() => { useMinesweeperStore.getState().setSetting('theme', 'amber'); });
        fireEvent.change(screen.getByLabelText('Accent colour'), { target: { value: '#654321' } });
        view.unmount();
        expect(document.documentElement.dataset.theme).toBe('amber');
    });

    it('restores the saved custom theme when an edit is abandoned', () => {
        const theme = sanitizeCustomTheme({
            id: 'saved', name: 'Saved',
            core: {
                ink: '#111111', paper: '#eeeeee', panel: '#dddddd', accent: '#225599',
                success: '#229944', warning: '#ddbb22', danger: '#bb2233',
                cellClosed: '#aaaaaa', cellOpen: '#eeeeee',
            },
        })!;
        useMinesweeperStore.getState().saveCustomTheme(theme);
        useMinesweeperStore.getState().setSetting('theme', `${CUSTOM_THEME_PREFIX}${theme.id}`);
        const view = render(<ThemeStudio />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit Saved' }));
        fireEvent.change(screen.getByLabelText('Accent colour'), { target: { value: '#123456' } });
        view.unmount();
        expect(document.documentElement.style.getPropertyValue('--ms-palette-blue'))
            .toBe(derivePalette(theme.core)['--ms-palette-blue']);
        expect(useMinesweeperStore.getState().customThemes).toEqual([theme]);
    });
});
