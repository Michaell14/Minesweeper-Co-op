'use client';

import React from 'react';
import { Button } from '@/components/ds';
import type { Drill } from '@/lib/drills';
import DrillRunner from './DrillRunner';

export interface LessonDrillsProps {
    drills: readonly Drill[];
}

export default function LessonDrills({ drills }: LessonDrillsProps) {
    const [index, setIndex] = React.useState(0);
    const [solvedIds, setSolvedIds] = React.useState<readonly string[]>([]);

    if (drills.length === 0) return null;

    const drill = drills[index];
    const solved = solvedIds.includes(drill.id);
    const last = index === drills.length - 1;

    return (
        <div className="flex flex-col items-center gap-4">
            <p className="ms-pixel text-pixel-2xs text-ink-muted m-0">
                Drill {index + 1} of {drills.length}
            </p>
            {/* Keyed, so advancing mounts a clean runner rather than reusing this one. */}
            <DrillRunner
                key={drill.id}
                drill={drill}
                onSolved={(id) => setSolvedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))}
            />
            {solved && !last && (
                <Button size="sm" onClick={() => setIndex((i) => i + 1)}>Next drill</Button>
            )}
            {solved && last && (
                <p className="ms-pixel text-pixel-xs m-0" role="status">Lesson complete</p>
            )}
        </div>
    );
}
