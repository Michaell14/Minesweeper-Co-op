import { StateCreator } from 'zustand';
import type { MinesweeperState } from './store';
import {
    DEFAULT_SETTINGS,
    readStoredSettings,
    sanitizeSettings,
    writeStoredSettings,
    type SettingKey,
    type Settings,
} from '@/lib/settings';
import { applyTheme } from '@/lib/theme';

/**
 * Settings in the store, so every consumer — the /settings page, the theme
 * dialog, later the game itself — reads ONE copy that cannot go stale. The
 * old ThemePicker held its own useState; mounting a second theme UI (the
 * settings page) would have let the two silently disagree.
 *
 * The store starts at defaults on the server and in the first client render,
 * then `hydrateSettings` reads storage after mount — reading localStorage
 * during render is a hydration mismatch. The theme *attribute* is already
 * correct before any of that runs (the no-flash script), so hydration changes
 * what the UI reports, never what is painted.
 */
export interface SettingsSlice {
    settings: Settings;
    /** False until storage has been read; sync waits on it. */
    settingsHydrated: boolean;

    hydrateSettings: () => void;
    setSetting: <K extends SettingKey>(key: K, value: Settings[K]) => void;
    /** Wholesale replacement from the server (sanitised here). Server-wins. */
    replaceSettings: (incoming: unknown) => void;
}

/** The one place a settings change touches the world outside the store. */
const applySideEffects = (settings: Settings) => {
    if (typeof document !== 'undefined') applyTheme(settings.theme);
};

export const createSettingsSlice: StateCreator<MinesweeperState, [], [], SettingsSlice> = (set) => ({
    settings: DEFAULT_SETTINGS,
    settingsHydrated: false,

    hydrateSettings: () => {
        const settings = readStoredSettings();
        applySideEffects(settings);
        set({ settings, settingsHydrated: true });
    },

    setSetting: (key, value) =>
        set((state) => {
            const settings = { ...state.settings, [key]: value };
            writeStoredSettings(settings);
            applySideEffects(settings);
            return { settings };
        }),

    replaceSettings: (incoming) => {
        const settings = sanitizeSettings(incoming);
        writeStoredSettings(settings);
        applySideEffects(settings);
        set({ settings, settingsHydrated: true });
    },
});
