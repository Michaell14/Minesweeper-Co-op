'use client';

import React from 'react';
import { Badge, Button } from '@/components/ds';
import type { Coord, Drill } from '@/lib/drills';
import { explain, nextHint } from '@/lib/drillDeduction';
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
    const [hints, setHints] = React.useState(0);
    const [message, setMessage] = React.useState<string | null>(null);
    const [hintAt, setHintAt] = React.useState<Coord | null>(null);

    React.useEffect(() => {
        setMarks(initialMarks(drill.layout));
        setMistakes(0);
        setHints(0);
        setMessage(null);
        setHintAt(null);
    }, [drill]);

    const solved = matches(marks, drill.solution.flag, 'flagged')
        && matches(marks, drill.solution.open, 'open');

    const recorded = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!solved || recorded.current === drill.id) return;
        recorded.current = drill.id;
        recordSolved(drill.id, { mistakes, hints });
        onSolved?.(drill.id, mistakes);
    }, [solved, drill.id, mistakes, hints, onSolved]);

    /** What the player has already worked out, so a hint moves them forward. */
    const settled = (): Coord[] => {
        const out: Coord[] = [];
        marks.forEach((row, r) => row.forEach((mark, c) => {
            if (mark === 'flagged' || mark === 'open') out.push([r, c]);
        }));
        return out;
    };

    const takeHint = () => {
        const hint = nextHint(drill.layout, settled());
        if (!hint) return;
        setHints((n) => n + 1);
        setHintAt(hint.at);
        setMessage(`Look at row ${hint.at[0] + 1}, column ${hint.at[1] + 1}. ${hint.why.text}`);
    };

    const move = (row: number, col: number, want: 'flagged' | 'open') => {
        if (solved) return;
        setMessage(null);
        setHintAt(null);
        const current = marks[row][col];
        // A flag protects the cell from being opened, as it does in the game.
        if (current === 'open' || (current === 'flagged' && want === 'open')) return;

        const next: DrillCellState = current === 'wrong' || current === 'flagged'
            ? 'covered'
            : (drill.layout[row][col] === '*') === (want === 'flagged') ? want : 'wrong';

        if (next === 'wrong') {
            setMistakes((n) => n + 1);
            // The reason comes from the RULES, not from the layout's mines — a
            // drill that just said "that was a mine" would teach nothing.
            setMessage(explain(drill.layout, row, col)?.text ?? null);
        }
        setMarks((prev) => prev.map((r, ri) =>
            ri === row ? r.map((cell, ci) => (ci === col ? next : cell)) : r));
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <p className="text-pixel-sm text-center m-0">{drill.prompt}</p>
            <DrillBoard
                layout={drill.layout}
                marks={marks}
                hintAt={hintAt}
                onOpen={(r, c) => move(r, c, 'open')}
                onFlag={(r, c) => move(r, c, 'flagged')}
            />
            {mistakes > 0 && (
                <p className="text-pixel-2xs text-ink-muted m-0" role="status">
                    {mistakes} mistake{mistakes === 1 ? '' : 's'}
                </p>
            )}
            {message && (
                <p
                    className="text-pixel-2xs text-ink-muted m-0 max-w-md text-center"
                    role="status"
                    aria-label="Explanation">
                    {message}
                </p>
            )}
            {!solved && (
                <Button size="sm" onClick={takeHint}>Hint</Button>
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
