'use client'
import React from 'react';
import { RadioCard, RadioCardGroup } from '@/components/ds';
import { THEMES, isSeasonal } from '@/lib/theme';
import { CUSTOM_THEME_PREFIX } from '@/lib/customThemes';
import { useMinesweeperStore } from '@/app/store';

/** RadioCard values are strings; the default palette has no data-theme value. */
const DEFAULT_THEME = '__default__';

/**
 * The palette cards, mounted by the /settings Appearance section. The selection
 * lives in the settings slice rather than local state, so this stays in step
 * with the theme however it was last changed.
 *
 * The store hydrates from storage after mount (see settingsSlice); until then
 * this briefly shows the default selected, while the PAINTED theme is already
 * correct via the no-flash script. `seasonalOverride` is read from the store
 * for the same reason it is stored rather than derived here: it moves on the
 * clock, and a value computed during render would go stale at midnight with
 * no state change to re-render it.
 *
 * `name` must be unique per mounted instance: these are real radio inputs,
 * and two groups sharing one name would steal each other's checked state.
 */
export default function ThemeCards({ name }: { name: string }) {
    // Field by field, not the whole slice: `setSetting` rebuilds the settings
    // object on every write, so selecting it wholesale would re-render all
    // seventeen cards on each step of the volume slider further down the page.
    const theme = useMinesweeperStore((s) => s.settings.theme);
    const holiday = useMinesweeperStore((s) => s.seasonalOverride);
    const customThemes = useMinesweeperStore((s) => s.customThemes);
    const setSetting = useMinesweeperStore((s) => s.setSetting);

    const choose = (value: string) =>
        setSetting('theme', value === DEFAULT_THEME ? null : value);

    /*
     * Out-of-season palettes are hidden, not removed — they stay valid ids, so
     * one already stored (a sync from a browser mid-holiday, say) keeps a card
     * to be checked rather than leaving the group with nothing selected.
     */
    const offered = THEMES.filter(
        (t) => !isSeasonal(t.id) || t.id === holiday?.themeId || t.id === theme,
    );

    const activeBuiltIn = THEMES.find((t) => t.id === (holiday?.themeId ?? theme));
    const activeCustom = customThemes.find(
        (t) => `${CUSTOM_THEME_PREFIX}${t.id}` === theme,
    );

    return (
        <>
            <RadioCardGroup
                name={name}
                ariaLabel="Colour palette"
                value={holiday?.themeId ?? theme ?? DEFAULT_THEME}
                onChange={choose}
                wrap
            >
                {offered.map((t) => (
                    <RadioCard
                        key={t.label}
                        value={t.id ?? DEFAULT_THEME}
                        label={t.label}
                        description={
                            <span className="whitespace-nowrap text-pixel-xs">{t.short}</span>
                        }
                    />
                ))}
                {customThemes.map((t) => (
                    <RadioCard
                        key={`${CUSTOM_THEME_PREFIX}${t.id}`}
                        value={`${CUSTOM_THEME_PREFIX}${t.id}`}
                        label={t.name}
                        description={
                            <span className="whitespace-nowrap text-pixel-xs">Custom</span>
                        }
                    />
                ))}
            </RadioCardGroup>
            <p className="text-pixel-xs text-ink-muted mt-4" aria-live="polite">
                {holiday
                    ? `${activeBuiltIn?.note} It is in season, so it is on for everyone — pick another and yours comes straight back.`
                    : activeCustom
                      ? `${activeCustom.name} — your own palette.`
                      : activeBuiltIn?.note}
            </p>
        </>
    );
}
