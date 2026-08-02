'use client'
import React from 'react';
import { RadioCard, RadioCardGroup } from '@/components/ds';
import { THEMES } from '@/lib/theme';
import { useMinesweeperStore } from '@/app/store';

/** RadioCard values are strings; the default palette has no data-theme value. */
const DEFAULT_THEME = '__default__';

/**
 * The palette cards, shared by the theme dialog (ThemePicker) and the
 * /settings Appearance section. Both read the settings slice, so however many
 * are mounted they cannot disagree — the reason this state moved out of
 * ThemePicker's own useState.
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
    const setSetting = useMinesweeperStore((s) => s.setSetting);

    const choose = (value: string) =>
        setSetting('theme', value === DEFAULT_THEME ? null : value);

    const active = THEMES.find((t) => t.id === theme);

    return (
        <>
            <RadioCardGroup
                name={name}
                ariaLabel="Colour palette"
                value={theme ?? DEFAULT_THEME}
                onChange={choose}
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
            </RadioCardGroup>
            <p className="text-pixel-xs text-ink-muted mt-4" aria-live="polite">
                {active?.note}
            </p>
        </>
    );
}
