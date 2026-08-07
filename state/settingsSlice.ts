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
    /**
     * The holiday painting over `settings.theme` right now, or null.
     *
     * Held rather than derived at each render because it changes on the CLOCK,
     * with nothing else moving — a component computing it from `new Date()`
     * would go stale at midnight with no state change to re-render it.
     * `refreshSeasonal` is what advances it.
     */
    seasonalOverride: HolidayOccurrence | null;

    hydrateSettings: () => void;
    /**
     * Re-resolves the schedule against the current clock, repainting only if
     * the answer moved. Driven by components/SettingsSync.tsx at each local
     * midnight and whenever the tab is shown again.
     */
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
 * The one place a settings change touches the world outside the store.
 * A `custom:` theme resolves against the saved list; pointing at a theme that
 * no longer exists renders the default rather than half a palette.
 *
 * A holiday in season wins over all of it, and `settings.theme` is left
 * untouched underneath — which is the whole reason the override is resolved
 * here, at paint, rather than written into the blob.
 */
const applySideEffects = (
    settings: Settings,
    customThemes: CustomTheme[],
): HolidayOccurrence | null => {
    // Null on the server: resolving the schedule there would seed the store
    // from the SERVER's date, which can be a day off the player's.
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

export const createSettingsSlice: StateCreator<MinesweeperState, [], [], SettingsSlice> = (set) => ({
    settings: DEFAULT_SETTINGS,
    settingsHydrated: false,
    customThemes: [],
    seasonalOverride: null,

    hydrateSettings: () => {
        const settings = readStoredSettings();
        const customThemes = readCustomThemes();
        const seasonalOverride = applySideEffects(settings, customThemes);
        // The mobile tap-mode default is applied at hydration ONLY: it seeds
        // the toggle for this visit. setSetting/replaceSettings deliberately
        // leave `isChecked` alone — flipping the in-game toggle under the
        // player mid-run because a sync arrived would be worse than any
        // default. (isChecked=true means "tap opens".)
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
            // Key, not identity: activeOverride builds a fresh object each call,
            // so comparing references would repaint every tick.
            if (holiday?.key === state.seasonalOverride?.key) return {};
            applySideEffects(state.settings, state.customThemes);
            return { seasonalOverride: holiday };
        }),

    setSetting: (key, value) =>
        set((state) => {
            const holiday = activeOverride(state.settings);

            // Picking the palette that is already painting is a no-op click on
            // the highlighted card. Writing it would outlive the window and
            // strand the player on Halloween in December.
            if (key === 'theme' && holiday && value === holiday.themeId) return {};

            const settings = { ...state.settings, [key]: value };

            // Choosing any other palette during a holiday IS the switch-away,
            // recorded against this occurrence so next year still surprises them.
            if (key === 'theme' && holiday) settings.seasonalDismissed = holiday.key;

            // Turning the switch back on means "yes, I want the holiday" — a
            // dismissal left over from earlier in the same window would
            // otherwise make the toggle look broken.
            if (key === 'seasonalThemes' && value === true) settings.seasonalDismissed = null;

            writeStoredSettings(settings);
            const seasonalOverride = applySideEffects(settings, state.customThemes);
            return { settings, seasonalOverride };
        }),

    replaceSettings: (incoming) => {
        set((state) => {
            const settings = sanitizeSettings(incoming);
            writeStoredSettings(settings);
            const seasonalOverride = applySideEffects(settings, state.customThemes);
            return { settings, seasonalOverride, settingsHydrated: true };
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
                const seasonalOverride = applySideEffects(settings, customThemes);
                return { customThemes, settings, seasonalOverride };
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
