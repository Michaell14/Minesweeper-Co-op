/**
 * The settings blob: every preference in one versioned localStorage value, the
 * signed-out player's only copy and the signed-in one's mirror of
 * `user_settings` (components/SettingsSync.tsx). Storage is untrusted input:
 * `sanitizeSettings` is the single gate for storage AND the server, degrading
 * broken fields to defaults, never throwing. Adding a setting = one key in
 * `Settings`, one default, one sanitiser.
 */

import { VALID_THEME_IDS, THEME_STORAGE_KEY as LEGACY_THEME_KEY } from "@/lib/theme";
import { SCHEDULE_SNIPPET } from "@/lib/holidays";
// spriteArt, not sprites: the art table is pure (no React, no CSS module).
import { SPRITE_SET_IDS } from "@/components/ds/spriteArt";

/** The board's cell-size ceiling — token variants in app/tokens.css. */
export const CELL_SIZES = ["compact", "standard", "large"] as const;
export type CellSize = (typeof CELL_SIZES)[number];

export interface Settings {
    /** Bumped only for a stored-shape rewrite; unknown keys drop and missing ones default anyway. */
    version: 1;
    /**
     * data-theme id, or null for the default. The player's OWN choice; a
     * holiday paints over it and never writes it (lib/holidays.ts).
     */
    theme: string | null;
    /** Let a holiday palette take over while its window is open. */
    seasonalThemes: boolean;
    /**
     * A pinned GENERAL mine/flag set, or null to follow the palette. Seasonal
     * ids are not valid: a holiday's pair wins over the pin the way its palette
     * wins over `theme`.
     */
    spriteSet: string | null;
    /** The one holiday occurrence switched away from ('halloween-2026'). Per
     * occurrence, so Halloween comes back next year and Christmas still arrives. */
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
    /** Show other players' reactions and pings. RECEIVE only — sending is never gated. */
    emotes: boolean;
    /** Arrow-key cursor + reveal/flag keys on the board. */
    keyboardControls: boolean;

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
    emotes: true,
    keyboardControls: true,
    sound: false,
    soundVolume: 0.5,
    showTimer: true,
    showFlagCounter: true,
    showProgressBar: true,
    cellSize: "standard",
};

const boolean = (value: unknown): boolean | undefined =>
    typeof value === "boolean" ? value : undefined;

/** Per-field sanitisers: a valid value, or undefined for "take the default". Never throw. */
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
    emotes: boolean,
    keyboardControls: boolean,
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
 * Everything stored, or defaults. A pre-blob browser has its theme under the
 * legacy `ms-theme` key; it is folded in so nobody's palette resets on upgrade.
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
 * The no-flash script, inlined into <head> before first paint (app/layout.tsx).
 * Dependency-free; it runs before any bundle. Reads the blob, then the legacy
 * `ms-theme` key, mirroring readStoredSettings. The seasonal check runs FIRST
 * and wins, mirroring `activeOverride`: otherwise a Game Boy player in October
 * would flip to Halloween once the store hydrates.
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
