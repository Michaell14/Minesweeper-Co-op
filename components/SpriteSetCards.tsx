'use client'
import React from 'react';
import { RadioCard, RadioCardGroup } from '@/components/ds';
// Past the barrel on purpose, like the /ds catalog: the art table and rect
// renderer are design-system internals, and this picker's job is showing them.
import {
    DEFAULT_SET,
    GENERAL_SPRITE_SETS,
    PixelRects,
    type SpriteSet,
} from '@/components/ds/sprites';
import { useMinesweeperStore } from '@/app/store';

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

/**
 * The mine/flag art picker on /settings. Only the GENERAL sets are offered —
 * the seasonal pairs are paint, arriving with their holiday window and
 * leaving with it, and while one paints it wins over the pin too.
 *
 * A stored null means no pin, which resolves to the default pair — the same
 * art "classic" names — so it shows as Classic rather than as its own card.
 */
export default function SpriteSetCards({ name }: { name: string }) {
    const spriteSet = useMinesweeperStore((s) => s.settings.spriteSet);
    const setSetting = useMinesweeperStore((s) => s.setSetting);

    return (
        <RadioCardGroup
            name={name}
            ariaLabel="Mine and flag art"
            value={spriteSet ?? 'classic'}
            onChange={(value) => setSetting('spriteSet', value)}
            wrap
        >
            <RadioCard
                value="classic"
                label="Classic"
                description={<PairPreview set={DEFAULT_SET} />}
            />
            {GENERAL_SPRITE_SETS.map(({ id, label, set }) => (
                <RadioCard
                    key={id}
                    value={id}
                    label={label}
                    description={<PairPreview set={set} />}
                />
            ))}
        </RadioCardGroup>
    );
}
