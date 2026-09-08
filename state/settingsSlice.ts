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
import { activeOverride, type HolidayOccurrence } from '@/lib/holidays';
import {
    CUSTOM_THEME_PREFIX,
    isCustomThemeSetting,
    readCustomThemes,
    writeCustomThemes,
    type CustomTheme,
} from '@/lib/customThemes';

/**
 * Settings in the store, so every consumer reads ONE copy that cannot go
 * stale. The store starts at defaults on the server and first client render,
 * then `hydrateSettings` reads storage after mount (reading localStorage
 * during render is a hydration mismatch). The theme attribute is already
 * right before that (the no-flash script), so hydration changes what the UI
 * reports, never what is painted.
 */
export interface SettingsSlice {
    settings: Settings;
    /** False until storage has been read; sync waits on it. */
    settingsHydrated: boolean;
    /** The player's saved custom palettes. Hydrated with settings. */
    customThemes: CustomTheme[];
    /**
     * The holiday painting over `settings.theme` right now, or null. Held, not
     * derived per render: it moves on the CLOCK with no state change to
     * re-render it. `refreshSeasonal` advances it.
     */
    seasonalOverride: HolidayOccurrence | null;

    hydrateSettings: () => void;
    /** Re-resolves the schedule against the clock, repainting only if it moved. Driven by SettingsSync. */
    refreshSeasonal: () => void;
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
 * The one place a settings change touches the world outside the store. A
 * `custom:` theme that no longer exists renders the default. A holiday in
 * season wins over all of it with `settings.theme` untouched underneath, which
 * is why the override is resolved here rather than written into the blob.
 */
const applySideEffects = (
    settings: Settings,
    customThemes: CustomTheme[],
): HolidayOccurrence | null => {
    // Null on the server: its date can be a day off the player's.
    if (typeof document === 'undefined') return null;
    const holiday = activeOverride(settings);
    if (holiday) {
        applyTheme(holiday.themeId);
        return holiday;
    }
    if (isCustomThemeSetting(settings.theme)) {
        const id = settings.theme.slice(CUSTOM_THEME_PREFIX.length);
        const theme = customThemes.find((t) => t.id === id);
        applyTheme(null, theme?.palette);
        return null;
    }
    applyTheme(settings.theme);
    return null;
};

/**
 * Turning reactions off takes the on-screen feed with it: `settings.emotes` is
 * applied on the RECEIVE path, so a held feed would paint again on next mount.
 */
const emoteFeedReset = (before: Settings, after: Settings) =>
    before.emotes && !after.emotes ? { playerEmotes: [] } : {};

export const createSettingsSlice: StateCreator<MinesweeperState, [], [], SettingsSlice> = (set) => ({
    settings: DEFAULT_SETTINGS,
    settingsHydrated: false,
    customThemes: [],
    seasonalOverride: null,

    hydrateSettings: () => {
        const settings = readStoredSettings();
        const customThemes = readCustomThemes();
        const seasonalOverride = applySideEffects(settings, customThemes);
        // The mobile tap-mode default seeds `isChecked` at hydration ONLY; a
        // sync must not flip the in-game toggle mid-run. (true means "tap opens".)
        set({
            settings,
            customThemes,
            seasonalOverride,
            settingsHydrated: true,
            isChecked: !settings.mobileDefaultFlag,
        });
    },

    refreshSeasonal: () =>
        set((state) => {
            const holiday = activeOverride(state.settings);
            // Key, not identity: activeOverride builds a fresh object each call.
            if (holiday?.key === state.seasonalOverride?.key) return {};
            applySideEffects(state.settings, state.customThemes);
            return { seasonalOverride: holiday };
        }),

    setSetting: (key, value) =>
        set((state) => {
            const holiday = activeOverride(state.settings);

            // Picking the palette already painting is a no-op; writing it would
            // outlive the window and strand the player on Halloween in December.
            if (key === 'theme' && holiday && value === holiday.themeId) return {};

            const settings = { ...state.settings, [key]: value };

            // Any other palette during a holiday is the switch-away, recorded for this occurrence only.
            if (key === 'theme' && holiday) settings.seasonalDismissed = holiday.key;

            // Turning the switch back on clears a dismissal from earlier in the same window.
            if (key === 'seasonalThemes' && value === true) settings.seasonalDismissed = null;

            writeStoredSettings(settings);
            const seasonalOverride = applySideEffects(settings, state.customThemes);
            return { settings, seasonalOverride, ...emoteFeedReset(state.settings, settings) };
        }),

    replaceSettings: (incoming) => {
        set((state) => {
            const settings = sanitizeSettings(incoming);
            writeStoredSettings(settings);
            const seasonalOverride = applySideEffects(settings, state.customThemes);
            return {
                settings,
                seasonalOverride,
                settingsHydrated: true,
                ...emoteFeedReset(state.settings, settings),
            };
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
                // The active palette vanished: fall back explicitly so storage, store and paint agree.
                const settings = { ...state.settings, theme: null };
                writeStoredSettings(settings);
                const seasonalOverride = applySideEffects(settings, customThemes);
                return { customThemes, settings, seasonalOverride };
            }
            return { customThemes };
        }),

    replaceCustomThemes: (customThemes) =>
        set((state) => {
            writeCustomThemes(customThemes);
            // The active custom theme may have arrived or changed in the merge.
            if (isCustomThemeSetting(state.settings.theme)) {
                applySideEffects(state.settings, customThemes);
            }
            return { customThemes };
        }),
});
