/**
 * The themes the catalog can preview.
 *
 * `id` is the `data-theme` value; `null` is the default palette, which sets no
 * attribute at all. Kept beside the catalog rather than in components/ds
 * because switching themes is a preview affordance, not a design primitive —
 * when the app grows a real theme picker this list moves with it.
 */
export interface ThemeOption {
    id: string | null;
    label: string;
    /** What this palette is for, and what it costs. */
    note: string;
}

export const THEMES: ThemeOption[] = [
    { id: null, label: "NES", note: "The default. Full hue range." },
    { id: "gameboy", label: "Game Boy", note: "Four shades total — the hardest case." },
    { id: "c64", label: "C64", note: "Sixteen colours. Everything survives." },
    { id: "dark", label: "Dark", note: "The one people will actually ask for." },
];

/** Applies a theme to the document, or clears it for the default palette. */
export function applyTheme(id: string | null): void {
    if (id) document.documentElement.dataset.theme = id;
    else delete document.documentElement.dataset.theme;
}
