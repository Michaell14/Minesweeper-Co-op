'use client';

import React from 'react';
import { Badge } from '@/components/ds';
import type { Coord, Drill } from '@/lib/drills';
import { recordSolved } from '@/lib/drillProgress';
import DrillBoard, { initialMarks, type DrillMarks } from './DrillBoard';
import type { DrillCellState } from './drillLabel';

export interface DrillRunnerProps {
    drill: Drill;
    onSolved?: (id: string, mistakes: number) => void;
}

/**
 * Solved is measured against the DECLARED solution, never against the layout's
 * mines — the two statements of the same fact stay independent all the way to
 * the UI, and `validateDrill` is what holds them together.
 */
const matches = (marks: DrillMarks, want: readonly Coord[], state: 'flagged' | 'open') => {
    const marked = marks.flat().filter((m) => m === state).length;
    return marked === want.length && want.every(([r, c]) => marks[r][c] === state);
};

export default function DrillRunner({ drill, onSolved }: DrillRunnerProps) {
    const [marks, setMarks] = React.useState<DrillMarks>(() => initialMarks(drill.layout));
    const [mistakes, setMistakes] = React.useState(0);

    React.useEffect(() => {
        setMarks(initialMarks(drill.layout));
        setMistakes(0);
    }, [drill]);

    const solved = matches(marks, drill.solution.flag, 'flagged')
        && matches(marks, drill.solution.open, 'open');

    const recorded = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!solved || recorded.current === drill.id) return;
        recorded.current = drill.id;
        recordSolved(drill.id, mistakes);
        onSolved?.(drill.id, mistakes);
    }, [solved, drill.id, mistakes, onSolved]);

    const move = (row: number, col: number, want: 'flagged' | 'open') => {
        if (solved) return;
        const current = marks[row][col];
        // A flag protects the cell from being opened, as it does in the game.
        if (current === 'open' || (current === 'flagged' && want === 'open')) return;

        const next: DrillCellState = current === 'wrong' || current === 'flagged'
            ? 'covered'
            : (drill.layout[row][col] === '*') === (want === 'flagged') ? want : 'wrong';

        if (next === 'wrong') setMistakes((n) => n + 1);
        setMarks((prev) => prev.map((r, ri) =>
            ri === row ? r.map((cell, ci) => (ci === col ? next : cell)) : r));
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <p className="text-pixel-sm text-center m-0">{drill.prompt}</p>
            <DrillBoard
                layout={drill.layout}
                marks={marks}
                onOpen={(r, c) => move(r, c, 'open')}
                onFlag={(r, c) => move(r, c, 'flagged')}
            />
            {mistakes > 0 && (
                <p className="text-pixel-2xs text-ink-muted m-0" role="status">
                    {mistakes} mistake{mistakes === 1 ? '' : 's'}
                </p>
            )}
            {solved && (
                <div className="flex flex-col items-center gap-2" role="status">
                    <Badge intent="success">Solved</Badge>
                    <p className="text-pixel-xs text-center m-0">{drill.explanation}</p>
                </div>
            )}
        </div>
    );
}
