'use client'
import React from 'react';
import { RadioCard, RadioCardGroup } from '@/components/ds';
// Past the barrel on purpose, like the /ds catalog: the art table and rect
// renderer are design-system internals, and this picker's job is showing them.
import {
    DEFAULT_SET,
    PixelRects,
    SPRITE_SETS,
    type SpriteSet,
} from '@/components/ds/sprites';
import { THEMES } from '@/lib/theme';
import { useMinesweeperStore } from '@/app/store';

/** RadioCard values are strings; "follow the palette" is null in the blob. */
const FOLLOW = '__follow__';

/**
 * The pair, drawn on the cell fills it actually sits on — via CSS vars, so the
 * preview repaints with the palette for free. aria-hidden: the card's label
 * already names the set.
 */
function PairPreview({ set }: { set: SpriteSet }) {
    return (
        <span className="flex gap-1 mb-1" aria-hidden="true">
            {(['mine', 'flag'] as const).map((kind) => (
                <span
                    key={kind}
                    className="flex h-6 w-6 items-center justify-center"
                    style={{
                        backgroundColor: `var(--ms-cell-${kind === 'mine' ? 'mine' : 'closed'})`,
                    }}
                >
                    <svg viewBox="0 0 16 16" width={18} height={18} shapeRendering="crispEdges">
                        <PixelRects art={set[kind]} />
                    </svg>
                </span>
            ))}
        </span>
    );
}

const labelFor = (id: string): string =>
    THEMES.find((t) => t.id === id)?.label ?? id;

/**
 * The mine/flag art picker on /settings. "Match palette" is the default and
 * today's behaviour; anything else pins that pair year-round, holidays
 * included — a pin is the player's own data, where a holiday is only paint.
 */
export default function SpriteSetCards({ name }: { name: string }) {
    const spriteSet = useMinesweeperStore((s) => s.settings.spriteSet);
    const setSetting = useMinesweeperStore((s) => s.setSetting);

    return (
        <RadioCardGroup
            name={name}
            ariaLabel="Mine and flag art"
            value={spriteSet ?? FOLLOW}
            onChange={(value) => setSetting('spriteSet', value === FOLLOW ? null : value)}
            wrap
        >
            <RadioCard
                value={FOLLOW}
                label="Match palette"
                description={<span className="whitespace-nowrap text-pixel-xs">Follows the theme</span>}
            />
            <RadioCard
                value="classic"
                label="Classic"
                description={<PairPreview set={DEFAULT_SET} />}
            />
            {Object.entries(SPRITE_SETS).map(([id, set]) => (
                <RadioCard
                    key={id}
                    value={id}
                    label={labelFor(id)}
                    description={<PairPreview set={set} />}
                />
            ))}
        </RadioCardGroup>
    );
}
