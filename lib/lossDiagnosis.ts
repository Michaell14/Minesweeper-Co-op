/** Naming the deduction a lost run missed, and the drill that teaches it. */

import type { Cell } from '@/shared/socketPayloads';
import { LESSON_RULES, type Explanation } from './drillDeduction';
import type { Coord, LessonId } from './drills';

/**
 * A live position in the layout format lib/drillDeduction.ts consumes.
 *
 * Flags are dropped deliberately: deduce() re-derives mines from the opened
 * numbers, so a wrong flag cannot make the diagnosis lie.
 */
export function positionToLayout(preLoss: Cell[][], revealed: Cell[][]): string[] {
    return preLoss.map((row, r) =>
        row
            .map((cell, c) => {
                if (cell.isOpen) return cell.nearbyMines === 0 ? '.' : String(cell.nearbyMines);
                return revealed[r]?.[c]?.isMine ? '*' : '#';
            })
            .join(''),
    );
}

/** Longest first, so 1221 wins over 121 and 121 over 12. */
const NAMED: readonly { pattern: string; lesson: LessonId }[] = [
    { pattern: '1221', lesson: 'one-two-two-one' },
    { pattern: '121', lesson: 'one-two-one' },
    { pattern: '12', lesson: 'one-two' },
    { pattern: '11', lesson: 'one-one' },
];

const isDigit = (ch: string) => ch >= '1' && ch <= '8';

/** The maximal run of opened digits spanning `indices`, or null if broken. */
function digitRun(line: string, indices: number[]): { run: string; start: number } | null {
    if (indices.some((i) => !isDigit(line[i]))) return null;
    let start = Math.min(...indices);
    let end = Math.max(...indices);
    for (let i = start; i <= end; i++) if (!isDigit(line[i])) return null;
    while (start > 0 && isDigit(line[start - 1])) start--;
    while (end < line.length - 1 && isDigit(line[end + 1])) end++;
    return { run: line.slice(start, end + 1), start };
}

/** Whether `pattern` sits in `run` at a window covering every clue offset. */
function spans(run: string, pattern: string, offsets: number[]): boolean {
    for (let i = 0; i + pattern.length <= run.length; i++) {
        if (run.slice(i, i + pattern.length) !== pattern) continue;
        if (offsets.every((o) => o >= i && o < i + pattern.length)) return true;
    }
    return false;
}

/**
 * Which lesson a deduction belongs to.
 *
 * Localised to the clue cells on purpose: `121` turns up somewhere in almost
 * every 16x16 board, and a whole-board scan would name a shape that had nothing
 * to do with the step that fired.
 */
export function classifyLesson(layout: readonly string[], why: Explanation): LessonId {
    if (why.rule === 'counting') return 'counting';
    if (why.clues.length !== 2) return 'reduction';

    const [[r1, c1], [r2, c2]] = why.clues;
    let found: { run: string; start: number } | null = null;
    let offsets: number[] = [];

    if (r1 === r2) {
        found = digitRun(layout[r1], [c1, c2]);
        offsets = [c1, c2];
    } else if (c1 === c2) {
        const column = layout.map((row) => row[c1]).join('');
        found = digitRun(column, [r1, r2]);
        offsets = [r1, r2];
    }
    if (!found) return 'reduction';

    const { run, start } = found;
    const local = offsets.map((o) => o - start);
    const reversed = [...run].reverse().join('');
    const mirrored = local.map((o) => run.length - 1 - o);

    for (const { pattern, lesson } of NAMED) {
        if (!spans(run, pattern, local) && !spans(reversed, pattern, mirrored)) continue;
        // 1-1 proves cells safe, 1-2 proves a mine; the longer shapes prove both.
        if (pattern.length === 2 && LESSON_RULES[lesson].firstSubset !== why.verdict) continue;
        return lesson;
    }
    return 'reduction';
}
