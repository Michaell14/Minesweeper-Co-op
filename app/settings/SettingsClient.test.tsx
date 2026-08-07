// @vitest-environment jsdom
/**
 * The settings page by accessible name: the heading, both section panels, the
 * palette radio group (shared ThemeCards against the real store), and the
 * account button's two states. What fails silently here is a section whose
 * heading stops labelling it, or theme cards that stop reflecting the store.
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
}));

import SettingsClient from './SettingsClient';
import { useMinesweeperStore } from '@/app/store';
import { THEMES, isSeasonal } from '@/lib/theme';
import { DEFAULT_SETTINGS } from '@/lib/settings';

beforeEach(() => {
    localStorage.clear();
    useMinesweeperStore.setState({ settings: { ...DEFAULT_SETTINGS }, settingsHydrated: true });
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
});

afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
});

/**
 * Pins the clock for a describe that reads the calendar. Only the palette
 * picker does — the sound, HUD and account cases have no business running
 * under fake timers, which are a standing source of async flake.
 */
const pinTo = (day: string) => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(new Date(`${day}T12:00:00`));
    });
    afterEach(() => vi.useRealTimers());
};

describe('structure', () => {
    it('has the heading, both sections, and a back link', () => {
        render(<SettingsClient />);
        expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
        expect(screen.getByText('Appearance')).toBeTruthy();
        expect(screen.getByText('Account')).toBeTruthy();
        const back = screen.getByRole('link', { name: 'Back to the game' }) as HTMLAnchorElement;
        expect(back.getAttribute('href')).toBe('/');
    });
});

describe('the palette picker out of season', () => {
    pinTo('2026-06-15');

    it('offers every year-round palette as a radio, reflecting the store', () => {
        render(<SettingsClient />);
        for (const theme of THEMES.filter((t) => !isSeasonal(t.id))) {
            expect(screen.getByRole('radio', { name: new RegExp(theme.label) })).toBeTruthy();
        }
    });

    it('keeps the seasonal palettes out of the picker', () => {
        render(<SettingsClient />);
        for (const theme of THEMES.filter((t) => isSeasonal(t.id))) {
            expect(screen.queryByRole('radio', { name: new RegExp(theme.label) })).toBeNull();
        }
    });
});

describe('choosing a palette', () => {
    // Pinned even though the assertions happen to hold either way: in season
    // this click takes the switch-away branch instead, and a case that changes
    // which path it exercises depending on the date is not one case.
    pinTo('2026-06-15');

    it('writes the store, the document and storage', () => {
        render(<SettingsClient />);
        fireEvent.click(screen.getByRole('radio', { name: /Game Boy/ }));

        expect(useMinesweeperStore.getState().settings.theme).toBe('gameboy');
        expect(document.documentElement.dataset.theme).toBe('gameboy');
        expect(localStorage.getItem('minesweeper_settings')).toContain('gameboy');
    });
});

/*
 * The seasonal override, from the picker's side. The rule these all circle is
 * that the holiday is PAINT and the saved palette is DATA: they must be able to
 * disagree, and the saved one has to survive the window intact.
 */
describe('a holiday in season', () => {
    pinTo('2026-10-31');

    it('offers its card, and only its card', () => {
        render(<SettingsClient />);
        expect(screen.getByRole('radio', { name: /Halloween/ })).toBeTruthy();
        expect(screen.queryByRole('radio', { name: /Christmas/ })).toBeNull();
    });

    it('shows as selected over the saved palette, without overwriting it', () => {
        useMinesweeperStore.setState({
            settings: { ...DEFAULT_SETTINGS, theme: 'gameboy' },
            settingsHydrated: true,
        });
        render(<SettingsClient />);

        expect((screen.getByRole('radio', { name: /Halloween/ }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('radio', { name: /Game Boy/ }) as HTMLInputElement).checked).toBe(false);
        expect(useMinesweeperStore.getState().settings.theme).toBe('gameboy');
    });

    it('switching away records the dismissal and restores the chosen palette', () => {
        render(<SettingsClient />);
        fireEvent.click(screen.getByRole('radio', { name: /Game Boy/ }));

        const { settings } = useMinesweeperStore.getState();
        expect(settings.theme).toBe('gameboy');
        expect(settings.seasonalDismissed).toBe('halloween-2026');
        expect(document.documentElement.dataset.theme).toBe('gameboy');
    });

    /* Clicking the card that is already lit must not outlive the window. */
    it('re-picking the holiday itself writes nothing', () => {
        render(<SettingsClient />);
        fireEvent.click(screen.getByRole('radio', { name: /Halloween/ }));

        const { settings } = useMinesweeperStore.getState();
        expect(settings.theme).toBeNull();
        expect(settings.seasonalDismissed).toBeNull();
    });

    it('turning the switch off gives the saved palette straight back', () => {
        useMinesweeperStore.setState({
            settings: { ...DEFAULT_SETTINGS, theme: 'c64' },
            settingsHydrated: true,
        });
        render(<SettingsClient />);
        fireEvent.click(screen.getByRole('switch', { name: 'Seasonal palettes' }));

        expect(useMinesweeperStore.getState().settings.seasonalThemes).toBe(false);
        expect(document.documentElement.dataset.theme).toBe('c64');
    });

    /* A stale dismissal would otherwise make the toggle look broken. */
    it('turning the switch back on brings this occurrence back', () => {
        useMinesweeperStore.setState({
            settings: {
                ...DEFAULT_SETTINGS,
                seasonalThemes: false,
                seasonalDismissed: 'halloween-2026',
            },
            settingsHydrated: true,
        });
        render(<SettingsClient />);
        fireEvent.click(screen.getByRole('switch', { name: 'Seasonal palettes' }));

        expect(useMinesweeperStore.getState().settings.seasonalDismissed).toBeNull();
        expect(document.documentElement.dataset.theme).toBe('halloween');
    });
});

describe('the account section', () => {
    it('signed out: explains local-only storage and offers sign in', () => {
        render(<SettingsClient />);
        expect(screen.getByText(/stored in this browser only/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    });

    it('signed in: explains sync and offers account management', () => {
        mockUseSession.mockReturnValue({ data: { user: {} }, status: 'authenticated' });
        render(<SettingsClient />);
        expect(screen.getByText(/sync to your account/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Manage account' })).toBeTruthy();
    });
});

describe('the gameplay and HUD sections', () => {
    it('renders every toggle by name, reflecting defaults', () => {
        render(<SettingsClient />);
        const expectSwitch = (name: string, checked: boolean) => {
            const control = screen.getByRole('switch', { name }) as HTMLInputElement;
            expect(control.checked).toBe(checked);
        };
        expectSwitch('Swap mouse buttons', false);
        expectSwitch('Chording', true);
        expectSwitch('Start taps in flag mode', false);
        expectSwitch('Confetti', true);
        expectSwitch('Share your cursor', true);
        expectSwitch('Timer', true);
        expectSwitch('Flag counter', true);
        expectSwitch('PVP progress bars', true);
    });

    it('flipping a toggle writes the store and storage', () => {
        render(<SettingsClient />);
        fireEvent.click(screen.getByRole('switch', { name: 'Swap mouse buttons' }));
        expect(useMinesweeperStore.getState().settings.swapMouseButtons).toBe(true);
        expect(localStorage.getItem('minesweeper_settings')).toContain('"swapMouseButtons":true');
    });

    it('offers the three cell sizes and stores a choice', () => {
        render(<SettingsClient />);
        for (const name of [/Compact/, /Standard/, /Large/]) {
            expect(screen.getByRole('radio', { name })).toBeTruthy();
        }
        fireEvent.click(screen.getByRole('radio', { name: /Compact/ }));
        expect(useMinesweeperStore.getState().settings.cellSize).toBe('compact');
    });
});

describe('the sound section', () => {
    it('ships off, with the volume controls disabled until enabled', () => {
        render(<SettingsClient />);
        const toggle = screen.getByRole('switch', { name: 'Sound effects' }) as HTMLInputElement;
        expect(toggle.checked).toBe(false);
        const slider = screen.getByRole('slider', { name: 'Sound volume' }) as HTMLInputElement;
        expect(slider.disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('enabling sound unlocks the slider, which writes the 0..1 volume', () => {
        render(<SettingsClient />);
        fireEvent.click(screen.getByRole('switch', { name: 'Sound effects' }));
        expect(useMinesweeperStore.getState().settings.sound).toBe(true);

        const slider = screen.getByRole('slider', { name: 'Sound volume' }) as HTMLInputElement;
        expect(slider.disabled).toBe(false);
        fireEvent.change(slider, { target: { value: '80' } });
        expect(useMinesweeperStore.getState().settings.soundVolume).toBe(0.8);
    });
});
