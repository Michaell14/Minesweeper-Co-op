'use client'
import React from 'react';
import { Switch } from '@/components/ds';
import { useMinesweeperStore } from '@/app/store';
import type { Settings } from '@/lib/settings';

/** The boolean settings — the only kind this row renders. */
type BooleanSettingKey = {
    [K in Exclude<keyof Settings, 'version'>]: Settings[K] extends boolean ? K : never;
}[Exclude<keyof Settings, 'version'>];

/**
 * One toggle on the settings page: name, one-line description, Switch. The
 * Switch's aria-label is the row's name, so `getByRole('switch', { name })`
 * finds it and a renamed row cannot silently detach from its control.
 */
export default function SettingRow({
    settingKey,
    name,
    description,
}: {
    settingKey: BooleanSettingKey;
    name: string;
    description: string;
}) {
    const value = useMinesweeperStore((s) => s.settings[settingKey]);
    const setSetting = useMinesweeperStore((s) => s.setSetting);

    return (
        <div className="flex items-center justify-between gap-6 py-3">
            <div>
                <p className="text-pixel-sm m-0">{name}</p>
                <p className="text-pixel-xs text-ink-muted m-0 mt-1">{description}</p>
            </div>
            <Switch
                checked={value}
                onChange={(checked) => setSetting(settingKey, checked)}
                aria-label={name}
            />
        </div>
    );
}
