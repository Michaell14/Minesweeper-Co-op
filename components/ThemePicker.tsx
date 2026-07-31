'use client'
import React from 'react';
import { Dialog, DialogClose, RadioCard, RadioCardGroup } from '@/components/ds';
import { DIALOGS } from '@/lib/dialogs';
import { THEMES, applyTheme, readStoredTheme, storeTheme } from '@/lib/theme';

/** RadioCard values are strings; the default palette has no data-theme value. */
const DEFAULT_THEME = '__default__';

/**
 * Palette chooser.
 *
 * The attribute on <html> is the source of truth, not this component's state —
 * it is already set before first paint by the inline script in the layout, so
 * on mount we read the stored value rather than imposing one. That ordering is
 * what keeps the picker from briefly disagreeing with what is on screen.
 */
export default function ThemePicker() {
    const [theme, setTheme] = React.useState<string | null>(null);

    React.useEffect(() => setTheme(readStoredTheme()), []);

    const choose = (value: string) => {
        const id = value === DEFAULT_THEME ? null : value;
        setTheme(id);
        applyTheme(id);
        storeTheme(id);
    };

    const active = THEMES.find((t) => t.id === theme);

    return (
        <Dialog
            id={DIALOGS.theme}
            title="Palette"
            className="max-w-2xl"
            actions={<DialogClose aria-label="Close palette dialog">Done</DialogClose>}
        >
            <RadioCardGroup
                name="app-theme"
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
        </Dialog>
    );
}
