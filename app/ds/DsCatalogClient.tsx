"use client";

import React from "react";
import {
    Badge,
    Button,
    CoinIcon,
    Field,
    GithubIcon,
    Input,
    Panel,
    RadioCard,
    RadioCardGroup,
    Switch,
    Table,
    TrophyIcon,
} from "@/components/ds";
import type { ButtonIntent } from "@/components/ds";

const INTENTS: ButtonIntent[] = ["default", "primary", "success", "warning", "error"];

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

export default function DsCatalogClient() {
    const [size, setSize] = React.useState("Medium");
    const [flagMode, setFlagMode] = React.useState(true);

    return (
        <main className="p-8 max-w-6xl mx-auto">
            <h1 className="text-pixel-2xl mb-2">Design system</h1>
            <p className="text-pixel-xs text-ink-muted mb-12 max-w-2xl">
                Every primitive in components/ds. Colours come from app/tokens.css —
                nothing below carries a hex of its own, so an alternate palette moves
                all of it at once.
            </p>

            <Section
                title="Button"
                note="Notched outline drawn with four offset box-shadows. Hover deepens the fill; press flips the bevel to the top-left."
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
                    <Input size="sm" placeholder="Invalid" validity="invalid" />
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
                        <p className="text-pixel-sm m-0">🚩 40</p>
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
                note="Replaces Chakra's rounded iOS-style toggle, which was the most off-brand control in the app. Square thumb, stepped transition."
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
                title="Icons"
                note="Stored as 16x16 character grids plus a palette, so the sprite is editable in place. Flattened to SVG rects once at module load. Any size, still crisp."
            >
                <div className="flex items-end gap-8">
                    <GithubIcon size={32} />
                    <CoinIcon size={48} />
                    <TrophyIcon size={64} />
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
