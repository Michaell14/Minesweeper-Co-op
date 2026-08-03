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
import {
    CUSTOM_THEME_PREFIX,
    isCustomThemeSetting,
    readCustomThemes,
    writeCustomThemes,
    type CustomTheme,
} from '@/lib/customThemes';

/**
 * Settings in the store, so every consumer — the /settings page, the game
 * itself — reads ONE copy that cannot go stale. The palette UI used to hold its
 * own useState in a floating dialog; mounting a second theme UI (the settings
 * page) would have let the two silently disagree.
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
    /** The player's saved custom palettes. Hydrated with settings. */
    customThemes: CustomTheme[];

    hydrateSettings: () => void;
    setSetting: <K extends SettingKey>(key: K, value: Settings[K]) => void;
    /** Wholesale replacement from the server (sanitised here). Server-wins. */
    replaceSettings: (incoming: unknown) => void;

    /** Create or update. Applies it too when it is the active theme. */
    saveCustomTheme: (theme: CustomTheme) => void;
    /** Delete; if it was active, the app falls back to the default palette. */
    deleteCustomTheme: (id: string) => void;
    /** Wholesale replacement from the server merge. Does not touch settings. */
    replaceCustomThemes: (themes: CustomTheme[]) => void;
}

/**
 * The one place a settings change touches the world outside the store.
 * A `custom:` theme resolves against the saved list; pointing at a theme that
 * no longer exists renders the default rather than half a palette.
 */
const applySideEffects = (settings: Settings, customThemes: CustomTheme[]) => {
    if (typeof document === 'undefined') return;
    if (isCustomThemeSetting(settings.theme)) {
        const id = settings.theme.slice(CUSTOM_THEME_PREFIX.length);
        const theme = customThemes.find((t) => t.id === id);
        applyTheme(null, theme?.palette);
        return;
    }
    applyTheme(settings.theme);
};

export const createSettingsSlice: StateCreator<MinesweeperState, [], [], SettingsSlice> = (set) => ({
    settings: DEFAULT_SETTINGS,
    settingsHydrated: false,
    customThemes: [],

    hydrateSettings: () => {
        const settings = readStoredSettings();
        const customThemes = readCustomThemes();
        applySideEffects(settings, customThemes);
        // The mobile tap-mode default is applied at hydration ONLY: it seeds
        // the toggle for this visit. setSetting/replaceSettings deliberately
        // leave `isChecked` alone — flipping the in-game toggle under the
        // player mid-run because a sync arrived would be worse than any
        // default. (isChecked=true means "tap opens".)
        set({ settings, customThemes, settingsHydrated: true, isChecked: !settings.mobileDefaultFlag });
    },

    setSetting: (key, value) =>
        set((state) => {
            const settings = { ...state.settings, [key]: value };
            writeStoredSettings(settings);
            applySideEffects(settings, state.customThemes);
            return { settings };
        }),

    replaceSettings: (incoming) => {
        set((state) => {
            const settings = sanitizeSettings(incoming);
            writeStoredSettings(settings);
            applySideEffects(settings, state.customThemes);
            return { settings, settingsHydrated: true };
        });
    },

    saveCustomTheme: (theme) =>
        set((state) => {
            const customThemes = [
                ...state.customThemes.filter((t) => t.id !== theme.id),
                theme,
            ];
            writeCustomThemes(customThemes);
            if (state.settings.theme === `${CUSTOM_THEME_PREFIX}${theme.id}`) {
                applySideEffects(state.settings, customThemes);
            }
            return { customThemes };
        }),

    deleteCustomTheme: (id) =>
        set((state) => {
            const customThemes = state.customThemes.filter((t) => t.id !== id);
            writeCustomThemes(customThemes);
            if (state.settings.theme === `${CUSTOM_THEME_PREFIX}${id}`) {
                // The active palette just vanished — fall back to the default
                // explicitly, so storage, store and paint agree.
                const settings = { ...state.settings, theme: null };
                writeStoredSettings(settings);
                applySideEffects(settings, customThemes);
                return { customThemes, settings };
            }
            return { customThemes };
        }),

    replaceCustomThemes: (customThemes) =>
        set((state) => {
            writeCustomThemes(customThemes);
            // The active custom theme may have just arrived (or changed) in
            // the merge; re-apply so paint follows the data.
            if (isCustomThemeSetting(state.settings.theme)) {
                applySideEffects(state.settings, customThemes);
            }
            return { customThemes };
        }),
});
