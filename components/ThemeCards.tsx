'use client'
import React from 'react';
import { RadioCard, RadioCardGroup } from '@/components/ds';
import { THEMES } from '@/lib/theme';
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
 * correct via the no-flash script.
 *
 * `name` must be unique per mounted instance: these are real radio inputs,
 * and two groups sharing one name would steal each other's checked state.
 */
export default function ThemeCards({ name }: { name: string }) {
    const theme = useMinesweeperStore((s) => s.settings.theme);
    const customThemes = useMinesweeperStore((s) => s.customThemes);
    const setSetting = useMinesweeperStore((s) => s.setSetting);

    const choose = (value: string) =>
        setSetting('theme', value === DEFAULT_THEME ? null : value);

    const activeBuiltIn = THEMES.find((t) => t.id === theme);
    const activeCustom = customThemes.find(
        (t) => `${CUSTOM_THEME_PREFIX}${t.id}` === theme,
    );

    return (
        <>
            <RadioCardGroup
                name={name}
                ariaLabel="Colour palette"
                value={theme ?? DEFAULT_THEME}
                onChange={choose}
                wrap
            >
                {THEMES.map((t) => (
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
                {activeCustom ? `${activeCustom.name} — your own palette.` : activeBuiltIn?.note}
            </p>
        </>
    );
}
