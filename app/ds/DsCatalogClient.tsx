"use client";

import React from "react";
import {
    Badge,
    Button,
    CalendarIcon,
    CoinIcon,
    Field,
    GithubIcon,
    Input,
    Panel,
    RadioCard,
    RadioCardGroup,
    Slider,
    Sprite,
    SwordsIcon,
    Switch,
    Table,
    TrophyIcon,
} from "@/components/ds";
import type { ButtonIntent } from "@/components/ds";
// Past the barrel on purpose, the way this page already reaches for the board's
// stylesheet: the art table is a design-system internal, and the catalog is the
// one page whose job is to show internals.
import { DEFAULT_SET, PixelRects, SPRITE_SETS, type SpriteSet } from "@/components/ds/sprites";
import board from "@/components/game/board.module.css";
import { readPaletteEntries } from "@/lib/theme";
import { THEMES, applyTheme, coverageOf, type ThemeCoverage } from "./themes";
import { AUDITED_PAIRS, measure, type ContrastResult } from "./contrast";

const INTENTS: ButtonIntent[] = ["default", "primary", "success", "warning", "error"];
const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** RadioCard values are strings; the default palette has no data-theme value. */
const DEFAULT_THEME = "__default__";

function Section({
    title,
    note,
    children,
}: {
    title: string;
    note?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="mb-16">
            <h2 className="text-pixel-lg mb-1">{title}</h2>
            {note && <p className="text-pixel-xs text-ink-muted mb-4 max-w-2xl">{note}</p>}
            <div>{children}</div>
        </section>
    );
}

/**
 * Rendered with the game's own board CSS rather than a lookalike, so the catalog
 * cannot drift from the board it depicts.
 */
function BoardPreview() {
    return (
        <div
            className={board.gameBoard}
            /* The board sizes cells to fit; this preview is a single row of 11. */
            style={{ '--board-cols': 11 } as React.CSSProperties}
        >
            <div className={board.gameRow}>
                {NUMBERS.map((n) => (
                    <div
                        key={n}
                        className={`${board.cell} ${board.open} ${board[`num${n}`]}`}
                    >
                        {n}
                    </div>
                ))}
                <div className={`${board.cell} ${board.closed}`} />
                <div className={`${board.cell} ${board.flagged}`} data-sprite="flag">
                    <Sprite kind="flag" className={board.cellSprite} />
                </div>
                <div className={`${board.cell} ${board.mine}`} data-sprite="mine">
                    <Sprite kind="mine" className={board.cellSprite} />
                </div>
            </div>
        </div>
    );
}

/**
 * Every sprite set, each drawn on the two cell fills it will actually sit on —
 * a mine only ever appears on the mine cell, a flag on a closed one. Read from
 * the CSSOM for the same reason the palette cards are: the page can only be
 * painted in one palette at a time, and this has to show all ten.
 */
function SpriteSheet() {
    const [fills, setFills] = React.useState<Map<string | null, Record<string, string>>>(new Map());
    React.useEffect(() => setFills(readPaletteEntries(["mine", "cell-closed"])), []);

    const sets: [string, string | null, SpriteSet][] = [
        ["Default", null, DEFAULT_SET],
        ...THEMES.filter((t) => t.id && SPRITE_SETS[t.id]).map(
            (t) => [t.label, t.id, SPRITE_SETS[t.id!]] as [string, string | null, SpriteSet],
        ),
    ];

    return (
        <div className="flex flex-wrap gap-4">
            {sets.map(([label, id, set]) => (
                <div key={label} className="flex flex-col gap-1" data-sprite-set={id ?? "default"}>
                    <div className="flex gap-1">
                        {(["mine", "flag"] as const).map((kind) => (
                            <span
                                key={kind}
                                className="flex items-center justify-center h-10 w-10 border border-muted"
                                style={{
                                    backgroundColor:
                                        fills.get(id)?.[kind === "mine" ? "mine" : "cell-closed"],
                                }}
                            >
                                <svg viewBox="0 0 16 16" width={28} height={28} shapeRendering="crispEdges" aria-hidden="true">
                                    <PixelRects art={set[kind]} />
                                </svg>
                            </span>
                        ))}
                    </div>
                    <span className="text-pixel-xs text-ink-muted">{label}</span>
                </div>
            ))}
        </div>
    );
}

function CoverageReport({ coverage }: { coverage: ThemeCoverage | null }) {
    if (!coverage) return null;
    const { total, overridden, inherited } = coverage;
    return (
        <p className="text-pixel-xs text-ink-muted mt-3">
            Overrides {overridden} of {total} palette entries.
            {inherited.length > 0 && (
                <> Inherits from the default palette: {inherited.join(", ")}.</>
            )}
        </p>
    );
}

/*
 * `auditedTheme` is the palette these numbers were MEASURED under, not the one
 * currently selected — the two differ for the render between a palette change
 * and the effect that re-measures. It is published as a data attribute because
 * scripts/ui-smoke walks every palette here and reads the failures out: without
 * it the walk has nothing to wait on, and a read that lands early sees the
 * previous palette's rows. Rows that show no failures then look exactly like a
 * palette that passes.
 *
 * null until the first measurement lands, so the attribute is absent rather
 * than present-and-lying while there is nothing to report.
 */
function ContrastReport({ results, auditedTheme }: { results: ContrastResult[]; auditedTheme: string | null }) {
    const failing = results.filter((r) => !r.passes);
    return (
        <div data-audited-theme={auditedTheme ?? undefined}>
            <p className="text-pixel-sm mb-3">
                {failing.length === 0
                    ? "All audited pairs meet WCAG AA."
                    : `${failing.length} of ${results.length} pairs fail WCAG AA.`}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                {results.map((r) => (
                    <p key={r.label} className="text-pixel-xs flex justify-between gap-4">
                        <span className={r.passes ? "text-ink-muted" : "text-status-failed"}>
                            {r.label}
                        </span>
                        <span className={r.passes ? "text-ink-muted" : "text-status-failed"}>
                            {r.ratio.toFixed(2)}:1 {r.passes ? "" : `(needs ${r.threshold})`}
                        </span>
                    </p>
                ))}
            </div>
        </div>
    );
}

export default function DsCatalogClient() {
    const [size, setSize] = React.useState("Medium");
    const [flagMode, setFlagMode] = React.useState(true);
    const [volume, setVolume] = React.useState(50);
    const [theme, setTheme] = React.useState<string | null>(null);
    const [contrast, setContrast] = React.useState<ContrastResult[]>([]);
    /*
     * Set in the same effect as `contrast`, so the two always commit together.
     * Starts null rather than at DEFAULT_THEME: before the first measurement
     * there are no results, and a value here would claim there were.
     */
    const [auditedTheme, setAuditedTheme] = React.useState<string | null>(null);
    const [coverage, setCoverage] = React.useState<ThemeCoverage | null>(null);

    /*
     * The theme goes on <html> so every component below re-renders under it,
     * and is cleared on unmount so the catalog never leaks its preview into the
     * app. Measuring synchronously is safe: measure() calls getComputedStyle,
     * which forces the pending style recalculation itself.
     */
    React.useEffect(() => {
        applyTheme(theme);
        setContrast(measure(AUDITED_PAIRS));
        setAuditedTheme(theme ?? DEFAULT_THEME);
        setCoverage(coverageOf(theme));
        return () => applyTheme(null);
    }, [theme]);

    return (
        <main className="p-8 max-w-6xl mx-auto">
            <h1 className="text-pixel-2xl mb-2">Design system</h1>
            <p className="text-pixel-xs text-ink-muted mb-12 max-w-2xl">
                Every primitive in components/ds. Colours come from app/tokens.css —
                nothing below carries a hex of its own, so an alternate palette moves
                all of it at once.
            </p>

            <Section
                title="Theme"
                note="Each palette overrides only the raw palette tokens — no component or semantic token is touched. Switching here restyles everything below it."
            >
                {/*
                  * A radio group, not toggle buttons: the choice is exclusive,
                  * and this dogfoods the primitive on the page whose job is
                  * showing the primitives. RadioCard needs string values, so
                  * the default palette round-trips through DEFAULT_THEME.
                  */}
                <RadioCardGroup
                    name="ds-theme"
                    ariaLabel="Preview palette"
                    value={theme ?? DEFAULT_THEME}
                    onChange={(v) => setTheme(v === DEFAULT_THEME ? null : v)}
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
                </RadioCardGroup>
                <p className="text-pixel-xs text-ink-muted mt-4">
                    {THEMES.find((t) => (t.id ?? DEFAULT_THEME) === (theme ?? DEFAULT_THEME))?.note}
                </p>
                <CoverageReport coverage={coverage} />
            </Section>

            <Section
                title="Board"
                note="The eight number colours, an unopened cell, a flag and a mine — rendered with the board's own stylesheet. This is where a small palette fails first. Seasonal palettes swap the two sprites (components/ds/sprites.tsx); pick one above to see them — unless a set is pinned in Settings, which wins here too."
            >
                <BoardPreview />
            </Section>

            <Section
                title="Sprites"
                note="The mine and the flag, drawn as 16x16 pixel art like the icons (components/ds/sprites.tsx). Each seasonal palette brings its own pair; every other palette takes the default one, which paints in tokens so it reads on all of them. Shown here on the cell fill each one actually sits on."
            >
                <SpriteSheet />
            </Section>

            <Section
                title="Contrast"
                note="Measured from resolved colours in the DOM, so it reflects the theme currently applied rather than the token source."
            >
                <ContrastReport results={contrast} auditedTheme={auditedTheme} />
            </Section>

            <Section
                title="Button"
                note="Notched outline drawn with four offset box-shadows. Hover lightens the fill — dark ink means darkening would cut contrast; press flips the bevel to the top-left."
            >
                <div className="flex flex-wrap items-start">
                    {INTENTS.map((i) => (
                        <Button key={i} intent={i} size="sm">
                            {i}
                        </Button>
                    ))}
                    <Button intent="primary" size="sm" disabled>
                        disabled
                    </Button>
                </div>
            </Section>

            <Section
                title="Input"
                note="No border-image, so no dashed borders in Chrome and no per-browser branch."
            >
                <div className="max-w-md">
                    <Input size="sm" placeholder="Enter Room Code" />
                    <Input size="sm" placeholder="Invalid" invalid />
                </div>
            </Section>

            <Section
                title="Panel"
                note="Square border, not notched — controls are notched, regions are boxed. The title is knocked out of the top edge and takes the panel's own fill."
            >
                <div className="flex gap-6 flex-wrap">
                    <Panel title="Room:" className="max-w-60">
                        <p className="text-pixel-sm">abc123</p>
                    </Panel>
                    <Panel centered className="max-w-60">
                        <p className="text-pixel-sm m-0"><Sprite kind="flag" /> 40</p>
                    </Panel>
                </div>
            </Section>

            <Section title="Badge" note="One element, four offset shadows as a fill.">
                <div className="flex flex-wrap">
                    <Badge intent="success">GAME WON!</Badge>
                    <Badge intent="error">GAME LOST!</Badge>
                </div>
            </Section>

            <Section
                title="Table"
                note="Corner pixels come from cell borders rather than two pseudo-elements per cell."
            >
                <Table>
                    <thead>
                        <tr>
                            <th scope="col">Player</th>
                            <th scope="col">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="text-pixel-md">Ada</td>
                            <td className="text-pixel-md">64</td>
                        </tr>
                        <tr>
                            <td className="text-pixel-md">Grace</td>
                            <td className="text-pixel-md">51</td>
                        </tr>
                    </tbody>
                </Table>
            </Section>

            <Section
                title="RadioCard"
                note="Real radio inputs inside labels — the smoke test reads .checked/.value off them, and keyboard navigation comes free."
            >
                <Field label="Board Size:">
                    <RadioCardGroup
                        name="catalog-size"
                        value={size}
                        onChange={setSize}
                        ariaLabel="Catalog board size"
                    >
                        {[
                            ["Small", "9x9"],
                            ["Medium", "16x16"],
                            ["Large", "20x16"],
                        ].map(([t, d]) => (
                            <RadioCard
                                key={t}
                                value={t}
                                label={t}
                                description={
                                    <span className="whitespace-nowrap text-[11px]">{d}</span>
                                }
                            />
                        ))}
                    </RadioCardGroup>
                </Field>
            </Section>

            <Section
                title="Switch"
                note="No retro precedent to copy, so it is a deliberate invention: square thumb, square track, stepped transition."
            >
                <div className="flex items-center gap-4">
                    <Switch
                        checked={flagMode}
                        onChange={setFlagMode}
                        aria-label="Toggle click and flag mode"
                    />
                    <p className="text-pixel-sm">{flagMode ? "Click" : "Flag"} Mode</p>
                </div>
            </Section>

            <Section
                title="Slider"
                note="A restyled native range input — keyboard and screen-reader behaviour come from the browser, only the paint is ours. Square thumb and track, matching the Switch."
            >
                <div className="flex items-center gap-4">
                    <Slider
                        value={volume}
                        onChange={setVolume}
                        aria-label="Demo volume"
                    />
                    <p className="text-pixel-sm w-12 text-right">{volume}%</p>
                </div>
            </Section>

            <Section
                title="Icons"
                note="Stored as 16x16 character grids plus a palette, so the sprite is editable in place. Flattened to SVG rects once at module load. Any size, still crisp. A palette entry can be currentColor — those two sit on a themed button and take its ink."
            >
                <div className="flex items-end gap-8">
                    <GithubIcon size={32} />
                    <CoinIcon size={48} />
                    <TrophyIcon size={64} />
                    <CalendarIcon size={48} />
                    <SwordsIcon size={48} />
                </div>
            </Section>

            <Section title="Tokens" note="The palette every component above reads from.">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        ["primary", "var(--ms-intent-primary)"],
                        ["success", "var(--ms-intent-success)"],
                        ["warning", "var(--ms-intent-warning)"],
                        ["error", "var(--ms-intent-error)"],
                        ["ink", "var(--ms-ink-strong)"],
                        ["panel", "var(--ms-surface-panel)"],
                        ["cell closed", "var(--ms-cell-closed)"],
                        ["cell open", "var(--ms-cell-open)"],
                    ].map(([name, v]) => (
                        <div key={name}>
                            <div
                                className="h-12 border-pixel border-edge"
                                style={{ backgroundColor: v }}
                            />
                            <p className="text-pixel-2xs mt-1">{name}</p>
                        </div>
                    ))}
                </div>
            </Section>
        </main>
    );
}
