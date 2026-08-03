'use client'
import React from 'react';
import { Button, Field, Input } from '@/components/ds';
import { useMinesweeperStore } from '@/app/store';
import {
    CORE_FIELDS,
    CUSTOM_THEME_PREFIX,
    addPendingThemeDeletion,
    clearPendingThemeDeletion,
    derivePalette,
    hexContrast,
    mintThemeId,
    sanitizeCustomTheme,
    MAX_CUSTOM_THEMES,
    type CustomTheme,
    type CustomThemeCore,
} from '@/lib/customThemes';
import { applyTheme } from '@/lib/theme';
import { deleteThemeRemote, saveThemeRemote } from '@/lib/themesApi';
import { AA_LARGE, AA_NORMAL } from '@/app/ds/contrast';

/**
 * The palette editor: nine core colours in, the whole palette derived
 * (lib/customThemes.ts). Edits preview LIVE against the real page — the
 * settings page is itself themed, so every panel, button and label around
 * the editor is the preview.
 *
 * The audit below the fields is advice, not a gate: a failing palette saves
 * with a warning (decision recorded in the PRD) — it is their eyes, and the
 * built-in Game Boy palette cannot pass everywhere either.
 */

/** Where each core colour is read from when seeding a new theme. */
const SEED_TOKENS: Record<keyof CustomThemeCore, string> = {
    ink: '--ms-palette-ink',
    paper: '--ms-palette-paper',
    panel: '--ms-palette-smoke',
    accent: '--ms-palette-blue',
    success: '--ms-palette-green',
    warning: '--ms-palette-yellow',
    danger: '--ms-palette-red',
    cellClosed: '--ms-palette-cell-closed',
    cellOpen: '--ms-palette-cell-open',
};

/** The palette on screen right now, as a starting point. */
const coreFromCurrentPaint = (): CustomThemeCore => {
    const style = getComputedStyle(document.documentElement);
    const out = {} as CustomThemeCore;
    for (const { key } of CORE_FIELDS) {
        const value = style.getPropertyValue(SEED_TOKENS[key]).trim().toLowerCase();
        out[key] = /^#[0-9a-f]{6}$/.test(value) ? value : '#888888';
    }
    return out;
};

interface AuditRow {
    label: string;
    ratio: number;
    threshold: number;
}

/** The handful of pairs that decide whether a palette is livable. */
const auditCore = (core: CustomThemeCore): AuditRow[] => {
    const palette = derivePalette(core);
    const worstNumber = Math.min(
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
            hexContrast(palette[`--ms-palette-num-${n}`], core.cellOpen),
        ),
    );
    return [
        { label: 'Text on the page', ratio: hexContrast(core.ink, core.paper), threshold: AA_NORMAL },
        { label: 'Text on panels', ratio: hexContrast(core.ink, core.panel), threshold: AA_NORMAL },
        {
            label: 'Button labels',
            ratio: hexContrast(palette['--ms-palette-blue-ink'], core.accent),
            threshold: AA_NORMAL,
        },
        { label: 'Numbers on open cells', ratio: worstNumber, threshold: AA_LARGE },
        {
            label: 'Closed vs open cells',
            ratio: hexContrast(core.cellClosed, core.cellOpen),
            threshold: 1.2, // distinguishability, not WCAG — the board must read
        },
    ];
};

interface Draft {
    /** null while creating — an id is minted at save. */
    id: string | null;
    name: string;
    core: CustomThemeCore;
}

export default function ThemeStudio() {
    const customThemes = useMinesweeperStore((s) => s.customThemes);
    const saveCustomTheme = useMinesweeperStore((s) => s.saveCustomTheme);
    const deleteCustomTheme = useMinesweeperStore((s) => s.deleteCustomTheme);
    const setSetting = useMinesweeperStore((s) => s.setSetting);

    const [draft, setDraft] = React.useState<Draft | null>(null);

    /** Puts paint back under the SAVED theme choice, dropping the preview. */
    const reapplySaved = () => {
        const state = useMinesweeperStore.getState();
        state.replaceSettings(state.settings);
    };

    const startNew = () => {
        setDraft({ id: null, name: 'My theme', core: coreFromCurrentPaint() });
    };

    const startEdit = (theme: CustomTheme) => {
        setDraft({ id: theme.id, name: theme.name, core: { ...theme.core } });
    };

    const setCoreField = (key: keyof CustomThemeCore, value: string) => {
        setDraft((d) => {
            if (!d) return d;
            const core = { ...d.core, [key]: value };
            // Live preview: stamp the derived palette straight onto :root.
            applyTheme(null, derivePalette(core));
            return { ...d, core };
        });
    };

    const cancel = () => {
        setDraft(null);
        reapplySaved();
    };

    const save = () => {
        if (!draft) return;
        const id =
            draft.id ?? mintThemeId(draft.name, new Set(customThemes.map((t) => t.id)));
        const theme = sanitizeCustomTheme({ id, name: draft.name, core: draft.core });
        if (!theme) return; // the name field is the only way to get here
        saveCustomTheme(theme);
        // A save under this id supersedes any pending deletion of it — a
        // deliberate re-creation must not be eaten by an old tombstone.
        clearPendingThemeDeletion(theme.id);
        // Saving also selects it — the palette being previewed is the one the
        // player just committed to.
        setSetting('theme', `${CUSTOM_THEME_PREFIX}${theme.id}`);
        void saveThemeRemote(theme); // no-op signed out
        setDraft(null);
    };

    const remove = (id: string) => {
        deleteCustomTheme(id);
        // Tombstone until the SERVER confirms: an unconfirmed delete would
        // otherwise resurrect at the next sign-in merge, where server wins.
        addPendingThemeDeletion(id);
        void deleteThemeRemote(id).then((ok) => {
            if (ok) clearPendingThemeDeletion(id);
        });
        if (draft?.id === id) {
            setDraft(null);
            reapplySaved();
        }
    };

    if (!draft) {
        return (
            <div className="mt-6">
                <div className="flex items-center flex-wrap gap-3">
                    <Button
                        size="sm"
                        onClick={startNew}
                        disabled={customThemes.length >= MAX_CUSTOM_THEMES}>
                        New theme
                    </Button>
                    {customThemes.length >= MAX_CUSTOM_THEMES && (
                        <p className="text-pixel-xs text-ink-muted m-0">
                            Shelf full ({MAX_CUSTOM_THEMES}) — delete one first.
                        </p>
                    )}
                </div>
                {customThemes.length > 0 && (
                    <ul className="mt-4 p-0 list-none">
                        {customThemes.map((t) => (
                            <li key={t.id} className="flex items-center gap-3 py-1">
                                <span className="text-pixel-sm flex-1">{t.name}</span>
                                <Button size="sm" onClick={() => startEdit(t)} aria-label={`Edit ${t.name}`}>
                                    Edit
                                </Button>
                                <Button
                                    size="sm"
                                    intent="error"
                                    onClick={() => remove(t.id)}
                                    aria-label={`Delete ${t.name}`}>
                                    Delete
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    const audit = auditCore(draft.core);
    const failing = audit.filter((row) => row.ratio < row.threshold);

    return (
        <div className="mt-6">
            <p className="text-pixel-sm">
                {draft.id ? `Editing “${draft.name}”` : 'New theme'} — the whole page
                previews your palette as you pick.
            </p>

            <Field label="Theme name" className="mt-3">
                <Input
                    aria-label="Theme name"
                    value={draft.name}
                    maxLength={24}
                    onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 mt-4">
                {CORE_FIELDS.map(({ key, label, hint }) => (
                    <label key={key} className="flex items-center gap-3">
                        <input
                            type="color"
                            value={draft.core[key]}
                            onChange={(e) => setCoreField(key, e.target.value)}
                            aria-label={`${label} colour`}
                            className="h-10 w-14 cursor-pointer border-0 p-0 bg-transparent"
                        />
                        <span>
                            <span className="block text-pixel-xs">{label}</span>
                            <span className="block text-pixel-2xs text-ink-muted">{hint}</span>
                        </span>
                    </label>
                ))}
            </div>

            <div className="mt-5" role="status" aria-label="Contrast audit">
                <p className="text-pixel-sm m-0 mb-2">Legibility check</p>
                {audit.map((row) => (
                    <p key={row.label} className="text-pixel-xs m-0 py-0.5">
                        {row.ratio >= row.threshold ? '✔' : '✖'} {row.label}:{' '}
                        {row.ratio.toFixed(1)}:1 (needs {row.threshold}:1)
                    </p>
                ))}
                {failing.length > 0 && (
                    <p className="text-pixel-xs mt-2">
                        Some pairs fall below the guideline. You can still save — your
                        eyes, your call — but expect hard-to-read spots.
                    </p>
                )}
            </div>

            <div className="flex gap-3 mt-5">
                <Button
                    intent="primary"
                    size="sm"
                    onClick={save}
                    disabled={draft.name.trim() === ''}>
                    {failing.length > 0 ? 'Save anyway' : 'Save theme'}
                </Button>
                <Button size="sm" onClick={cancel}>Cancel</Button>
                {draft.id && (
                    <Button size="sm" intent="error" onClick={() => remove(draft.id!)}>
                        Delete
                    </Button>
                )}
            </div>
        </div>
    );
}
