'use client'
import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button, Panel, RadioCard, RadioCardGroup } from '@/components/ds';
import { DIALOGS, openDialog } from '@/lib/dialogs';
import ThemeCards from '@/components/ThemeCards';
import SpriteSetCards from '@/components/SpriteSetCards';
import ThemeStudio from '@/components/ThemeStudio';
import SettingRow from './SettingRow';
import { useMinesweeperStore } from '@/app/store';
import { CELL_SIZES, type CellSize } from '@/lib/settings';
import { playSound } from '@/lib/sound';
import { Slider } from '@/components/ds';

/** Card copy for the cell-size choice. */
const CELL_SIZE_LABELS: Record<CellSize, { label: string; short: string }> = {
    compact: { label: 'Compact', short: 'More board' },
    standard: { label: 'Standard', short: 'The default' },
    large: { label: 'Large', short: 'Bigger targets' },
};

/**
 * The settings page body. Each section is a titled Panel with a real heading,
 * so the page reads as a document and each area has an accessible landmark.
 * The account dialogs themselves are mounted by the Footer (in the layout,
 * so present here too) — the button just opens them.
 */
export default function SettingsClient() {
    const { status } = useSession();
    const cellSize = useMinesweeperStore((s) => s.settings.cellSize);
    const soundOn = useMinesweeperStore((s) => s.settings.sound);
    const soundVolume = useMinesweeperStore((s) => s.settings.soundVolume);
    const setSetting = useMinesweeperStore((s) => s.setSetting);

    return (
        <main className="max-w-3xl mx-auto px-6 pt-10 pb-24">
            <div className="flex items-baseline justify-between flex-wrap gap-4 mb-8">
                <h1 className="text-pixel-2xl">Settings</h1>
                <Link href="/" className="text-pixel-sm underline">
                    Back to the game
                </Link>
            </div>

            <section aria-labelledby="settings-appearance" className="mb-8">
                <Panel title={<span id="settings-appearance">Appearance</span>}>
                    <ThemeCards name="app-theme-settings" />
                    {/* Styled label, not a heading: this page's section titles are
                        spans on purpose, and an h3 here would skip a level. The
                        group's accessible name comes from its own aria-label. */}
                    <p className="text-pixel-sm mt-6 mb-2">Mine &amp; flag art</p>
                    <SpriteSetCards name="app-sprite-set-settings" />
                    <SettingRow
                        settingKey="seasonalThemes"
                        name="Seasonal palettes"
                        description="Let a holiday palette and its mine &amp; flag art take over around Halloween, Christmas and a few others. Your own choice comes back afterwards."
                    />
                    <ThemeStudio />
                </Panel>
            </section>

            <section aria-labelledby="settings-gameplay" className="mb-8">
                <Panel title={<span id="settings-gameplay">Gameplay</span>}>
                    <SettingRow
                        settingKey="swapMouseButtons"
                        name="Swap mouse buttons"
                        description="Left click flags, right click opens."
                    />
                    <SettingRow
                        settingKey="chording"
                        name="Chording"
                        description="Both buttons, middle click, or a right click on a number opens its unflagged neighbours."
                    />
                    <SettingRow
                        settingKey="mobileDefaultFlag"
                        name="Start taps in flag mode"
                        description="On touch screens, tapping flags by default instead of opening."
                    />
                    <SettingRow
                        settingKey="confetti"
                        name="Confetti"
                        description="The celebration burst on a win."
                    />
                    <SettingRow
                        settingKey="shareCursor"
                        name="Share your cursor"
                        description="Teammates in a co-op room see which cell you are hovering."
                    />
                    <SettingRow
                        settingKey="keyboardControls"
                        name="Keyboard controls"
                        description="Arrow keys or WASD move a cursor on the board. Space or Enter reveals, F flags, Escape hides it."
                    />
                </Panel>
            </section>

            <section aria-labelledby="settings-sound" className="mb-8">
                <Panel title={<span id="settings-sound">Sound</span>}>
                    <SettingRow
                        settingKey="sound"
                        name="Sound effects"
                        description="8-bit blips for reveals, flags, cascades, wins and losses. Off by default."
                    />
                    <div className="flex items-center justify-between gap-6 py-3">
                        <div>
                            <p className="text-pixel-sm m-0">Volume</p>
                            <p className="text-pixel-xs text-ink-muted m-0 mt-1">
                                Preview plays a reveal blip at this level.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Slider
                                aria-label="Sound volume"
                                value={Math.round(soundVolume * 100)}
                                min={0}
                                max={100}
                                step={5}
                                disabled={!soundOn}
                                onChange={(value) => setSetting('soundVolume', value / 100)}
                            />
                            {/* Also the surest audio unlock: a real click. */}
                            <Button
                                size="sm"
                                disabled={!soundOn}
                                onClick={() => playSound('win')}>
                                Preview
                            </Button>
                        </div>
                    </div>
                </Panel>
            </section>

            <section aria-labelledby="settings-hud" className="mb-8">
                <Panel title={<span id="settings-hud">HUD</span>}>
                    <SettingRow
                        settingKey="showTimer"
                        name="Timer"
                        description="The live clock. Runs are still timed for the summary either way."
                    />
                    <SettingRow
                        settingKey="showFlagCounter"
                        name="Flag counter"
                        description="Mines remaining, next to the board."
                    />
                    <SettingRow
                        settingKey="showProgressBar"
                        name="PVP progress bars"
                        description="Yours and your opponent's, during a race."
                    />
                    <div className="pt-3">
                        <p className="text-pixel-sm m-0 mb-3">Cell size</p>
                        <RadioCardGroup
                            name="cell-size"
                            ariaLabel="Cell size"
                            value={cellSize}
                            onChange={(value) => setSetting('cellSize', value as CellSize)}
                        >
                            {CELL_SIZES.map((size) => (
                                <RadioCard
                                    key={size}
                                    value={size}
                                    label={CELL_SIZE_LABELS[size].label}
                                    description={
                                        <span className="whitespace-nowrap text-pixel-xs">
                                            {CELL_SIZE_LABELS[size].short}
                                        </span>
                                    }
                                />
                            ))}
                        </RadioCardGroup>
                        <p className="text-pixel-xs text-ink-muted mt-3">
                            A ceiling, not a fixed size — boards still shrink to fit your
                            screen.
                        </p>
                    </div>
                </Panel>
            </section>

            <section aria-labelledby="settings-account">
                <Panel title={<span id="settings-account">Account</span>}>
                    {status === 'authenticated' ? (
                        <p className="text-pixel-sm">
                            Signed in — your settings sync to your account and follow you
                            to any browser you sign in on.{' '}
                            <Link href="/profile" className="underline">
                                View your profile
                            </Link>
                            .
                        </p>
                    ) : (
                        <p className="text-pixel-sm">
                            Your settings are stored in this browser only. Sign in to
                            keep them on every device.
                        </p>
                    )}
                    <Button
                        size="sm"
                        className="mt-4"
                        onClick={() => openDialog(DIALOGS.account)}>
                        {status === 'authenticated' ? 'Manage account' : 'Sign in'}
                    </Button>
                </Panel>
            </section>
        </main>
    );
}
