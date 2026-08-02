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
import { THEMES } from '@/lib/theme';
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

describe('structure', () => {
    it('has the heading, both sections, and a back link', () => {
        render(<SettingsClient />);
        expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
        expect(screen.getByText('Appearance')).toBeTruthy();
        expect(screen.getByText('Account')).toBeTruthy();
        const back = screen.getByRole('link', { name: 'Back to the game' }) as HTMLAnchorElement;
        expect(back.getAttribute('href')).toBe('/');
    });

    it('offers every palette as a radio, reflecting the store', () => {
        render(<SettingsClient />);
        for (const theme of THEMES) {
            expect(screen.getByRole('radio', { name: new RegExp(theme.label) })).toBeTruthy();
        }
    });
});

describe('choosing a palette', () => {
    it('writes the store, the document and storage', () => {
        render(<SettingsClient />);
        fireEvent.click(screen.getByRole('radio', { name: /Game Boy/ }));

        expect(useMinesweeperStore.getState().settings.theme).toBe('gameboy');
        expect(document.documentElement.dataset.theme).toBe('gameboy');
        expect(localStorage.getItem('minesweeper_settings')).toContain('gameboy');
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
