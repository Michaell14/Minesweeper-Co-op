/**
 * The settings blob: every preference in one versioned localStorage value,
 * shared by the signed-out player (this is their only copy) and the signed-in
 * one (the server mirror in `user_settings` wins at sign-in, then last write
 * wins — see components/SettingsSync.tsx).
 *
 * Storage is untrusted input, same stance as lib/bestTimes.ts: a corrupt blob,
 * a hand-edited value or a key from a future version degrades to defaults for
 * the fields it broke, never to a throw. `sanitizeSettings` is the single
 * gate — everything read from storage OR the server goes through it, so the
 * two sources cannot disagree about what a valid setting is.
 *
 * Adding a setting = one key in `Settings`, one default, one sanitiser. The
 * PRD's later phases (gameplay, sound, HUD) land here as exactly that.
 */

import { VALID_THEME_IDS, THEME_STORAGE_KEY as LEGACY_THEME_KEY } from "@/lib/theme";
import { SCHEDULE_SNIPPET } from "@/lib/holidays";
import { SPRITE_SET_IDS } from "@/components/ds/sprites";

/** The board's cell-size ceiling — token variants in app/tokens.css. */
export const CELL_SIZES = ["compact", "standard", "large"] as const;
export type CellSize = (typeof CELL_SIZES)[number];

export interface Settings {
    /** Bumped only when a stored shape needs rewriting, not for new keys —
     * unknown keys are dropped and missing ones defaulted regardless. */
    version: 1;
    /**
     * data-theme id, or null for the default palette. This is the player's
     * OWN choice and is never written by the seasonal schedule — a holiday
     * paints over it for the length of its window and leaves it intact
     * (lib/holidays.ts, state/settingsSlice.ts).
     */
    theme: string | null;
    /** Let a holiday palette take over while its window is open. */
    seasonalThemes: boolean;
    /**
     * A pinned mine/flag sprite set ("classic", "halloween", ...), or null to
     * follow the palette. A pin is the player's own data, so it beats the
     * holiday's ART — the holiday still paints its colours.
     */
    spriteSet: string | null;
    /**
     * The one holiday occurrence already switched away from — 'halloween-2026'.
     * Per occurrence rather than a flag, so dismissing Halloween still lets
     * Christmas arrive and brings Halloween back next year.
     */
    seasonalDismissed: string | null;

    // --- Gameplay ---
    /** Left click flags, right click opens. */
    swapMouseButtons: boolean;
    /** Mobile taps start in flag mode instead of open mode. */
    mobileDefaultFlag: boolean;
    /** Both-buttons / middle-click / right-click-a-number chording. */
    chording: boolean;
    /** Win celebration bursts (composed with prefers-reduced-motion). */
    confetti: boolean;
    /** Broadcast your cursor position to the co-op room. Privacy setting. */
    shareCursor: boolean;

    // --- Sound ---
    /** Off by default — nobody gets surprise audio. */
    sound: boolean;
    /** 0..1, scaled again by lib/sound.ts's master ceiling. */
    soundVolume: number;

    // --- HUD ---
    showTimer: boolean;
    showFlagCounter: boolean;
    /** The PVP progress bars. */
    showProgressBar: boolean;
    cellSize: CellSize;
}

export type SettingKey = Exclude<keyof Settings, "version">;

export const SETTINGS_STORAGE_KEY = "minesweeper_settings";

export const DEFAULT_SETTINGS: Settings = {
    version: 1,
    theme: null,
    seasonalThemes: true,
    spriteSet: null,
    seasonalDismissed: null,
    swapMouseButtons: false,
    mobileDefaultFlag: false,
    chording: true,
    confetti: true,
    shareCursor: true,
    sound: false,
    soundVolume: 0.5,
    showTimer: true,
    showFlagCounter: true,
    showProgressBar: true,
    cellSize: "standard",
};

const boolean = (value: unknown): boolean | undefined =>
    typeof value === "boolean" ? value : undefined;

/**
 * Per-field sanitisers: a valid value, or undefined to mean "take the
 * default". Never throw — they are fed raw JSON from storage and the network.
 */
/** `custom:<slug>` — a saved custom theme. The slug rules match lib/customThemes.ts. */
const CUSTOM_THEME_SETTING_RE = /^custom:[a-z0-9][a-z0-9-]{0,39}$/;

/** `<holiday-id>-<year>`. Shape only — an id retired later just never matches. */
const OCCURRENCE_RE = /^[a-z][a-z-]{0,39}-\d{4}$/;

const SANITISERS: { [K in SettingKey]: (value: unknown) => Settings[K] | undefined } = {
    theme: (value) =>
        value === null ||
        (typeof value === "string" &&
            (VALID_THEME_IDS.includes(value) || CUSTOM_THEME_SETTING_RE.test(value)))
            ? (value as string | null)
            : undefined,
    seasonalThemes: boolean,
    spriteSet: (value) =>
        value === null || (typeof value === "string" && SPRITE_SET_IDS.includes(value))
            ? (value as string | null)
            : undefined,
    seasonalDismissed: (value) =>
        value === null || (typeof value === "string" && OCCURRENCE_RE.test(value))
            ? (value as string | null)
            : undefined,
    swapMouseButtons: boolean,
    mobileDefaultFlag: boolean,
    chording: boolean,
    confetti: boolean,
    shareCursor: boolean,
    sound: boolean,
    soundVolume: (value) =>
        typeof value === "number" && Number.isFinite(value)
            ? Math.min(1, Math.max(0, value))
            : undefined,
    showTimer: boolean,
    showFlagCounter: boolean,
    showProgressBar: boolean,
    cellSize: (value) =>
        CELL_SIZES.includes(value as CellSize) ? (value as CellSize) : undefined,
};

/** A complete, valid Settings from anything at all. */
export function sanitizeSettings(raw: unknown): Settings {
    const out: Settings = { ...DEFAULT_SETTINGS };
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
        for (const key of Object.keys(SANITISERS) as SettingKey[]) {
            const value = SANITISERS[key]((raw as Record<string, unknown>)[key]);
            if (value !== undefined) (out as unknown as Record<string, unknown>)[key] = value;
        }
    }
    return out;
}

/**
 * Everything stored, or defaults. A browser from before the blob existed has
 * its theme under the legacy `ms-theme` key; it is folded in here (and the old
 * key removed on the next write) so nobody's palette resets on upgrade.
 */
export function readStoredSettings(): Settings {
    if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };

    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    } catch {
        return { ...DEFAULT_SETTINGS }; // blocked storage, e.g. private browsing
    }

    if (raw !== null) {
        try {
            return sanitizeSettings(JSON.parse(raw));
        } catch {
            return { ...DEFAULT_SETTINGS }; // corrupt JSON loses the blob, not the page
        }
    }

    // No blob yet — migrate the pre-settings theme key if there is one.
    try {
        const legacy = window.localStorage.getItem(LEGACY_THEME_KEY);
        return sanitizeSettings({ theme: legacy });
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

/** Persists the blob, retiring the legacy theme key it supersedes. */
export function writeStoredSettings(settings: Settings): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        window.localStorage.removeItem(LEGACY_THEME_KEY);
    } catch {
        // Full or blocked — the choice holds for this page, persistence is lost.
    }
}

/**
 * The no-flash script, inlined into <head> and run before first paint (see
 * app/layout.tsx). Moved here from lib/theme.ts when the theme joined the
 * settings blob: it reads the blob first and falls back to the legacy
 * `ms-theme` key, mirroring readStoredSettings — a themed player whose
 * storage predates the blob still gets no flash on the upgrade visit.
 * Deliberately dependency-free; it runs before any bundle.
 *
 * The seasonal check happens FIRST and wins, mirroring `activeOverride`: a
 * holiday overrides the saved theme rather than replacing it, so a player on
 * Game Boy in October must paint Halloween here too, or the palette would flip
 * once the store hydrates — the exact flash this script exists to prevent.
 */
export const NO_FLASH_SCRIPT = `
(function () {
  ${SCHEDULE_SNIPPET}
  try {
    var t = null;
    var s = null;
    try {
      var raw = localStorage.getItem(${JSON.stringify(SETTINGS_STORAGE_KEY)});
      if (raw) {
        s = JSON.parse(raw);
        if (s && typeof s.theme === 'string') t = s.theme;
      }
    } catch (e) {}
    if (s === null || typeof s !== 'object') s = {};
    if (s.seasonalThemes !== false) {
      var h = holidayOn(new Date());
      if (h && h[1] !== s.seasonalDismissed) {
        document.documentElement.setAttribute('data-theme', h[0]);
        return;
      }
    }
    if (!t) t = localStorage.getItem(${JSON.stringify(LEGACY_THEME_KEY)});
    if (!t) return;
    if (t.indexOf('custom:') === 0) {
      // A saved custom theme: stamp its resolved palette before first paint.
      // Only palette-layer names and hex values pass — the blob is
      // user-writable storage, not something to hand style access.
      var themes = JSON.parse(localStorage.getItem(${JSON.stringify("minesweeper_custom_themes")}) || '[]');
      for (var i = 0; i < themes.length; i++) {
        if (themes[i] && themes[i].id === t.slice(7) && themes[i].palette) {
          var p = themes[i].palette;
          for (var k in p) {
            if (k.indexOf('--ms-palette-') === 0 && /^#[0-9a-fA-F]{3,8}$/.test(p[k])) {
              document.documentElement.style.setProperty(k, p[k]);
            }
          }
          break;
        }
      }
      return;
    }
    if (${JSON.stringify(VALID_THEME_IDS)}.indexOf(t) !== -1) {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`.trim();
