/** Naming the deduction a lost run missed, and the drill that teaches it. */

import type { Cell } from '@/shared/socketPayloads';
import { LESSON_RULES, deduce, explain, nextHint, type Explanation } from './drillDeduction';
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

export interface LossDiagnosis {
    /** Whether the mine they opened had a proof, or a proof sat elsewhere. */
    kind: 'provable-mine' | 'guess';
    lesson: LessonId;
    text: string;
    /** The opened numbers that prove it — outlined on the replay. */
    clues: Coord[];
    /** The mine they hit, or the safe cell they missed. */
    target: Coord;
    verdict: 'mine' | 'safe';
}

const SHORT_NAME: Record<LessonId, string> = {
    'counting': 'a counting step',
    'one-one': 'a 1-1',
    'one-two': 'a 1-2',
    'one-two-one': 'a 1-2-1',
    'one-two-two-one': 'a 1-2-2-1',
    'reduction': 'a subset reduction',
    'in-the-wild': 'a pattern',
};

/** How the dialog says a lesson's name. */
export const shortLessonName = (lesson: LessonId): string => SHORT_NAME[lesson];

/** The four shapes worth naming over a plain counting or subset step. */
const NAMED_LESSONS: ReadonlySet<LessonId> =
    new Set(['one-one', 'one-two', 'one-two-one', 'one-two-two-one']);

/**
 * Case B's target: the first provable cell whose lesson names a pattern,
 * scanning deduce()'s cells mines-then-safe, row-major within each — a
 * counting step is provable on nearly every real board, so picking whichever
 * cell the solver reaches first almost never surfaces the pattern that was
 * actually there to teach. Null when nothing on the board names one, so the
 * caller can fall back to the plain first-hint order.
 */
function namedPatternHint(layout: readonly string[]): { at: Coord; why: Explanation } | null {
    const { mines, safe } = deduce(layout);
    for (const [r, c] of [...mines, ...safe]) {
        const why = explain(layout, r, c);
        if (why && NAMED_LESSONS.has(classifyLesson(layout, why))) return { at: [r, c], why };
    }
    return null;
}

/** The mine the fatal move opened: open in the payload, covered before it. */
function detonatedMine(preLoss: Cell[][], revealed: Cell[][]): Coord | null {
    for (let r = 0; r < revealed.length; r++) {
        for (let c = 0; c < revealed[r].length; c++) {
            if (revealed[r][c].isMine && revealed[r][c].isOpen && !preLoss[r]?.[c]?.isOpen) {
                return [r, c];
            }
        }
    }
    return null;
}

const from = (
    kind: LossDiagnosis['kind'],
    layout: readonly string[],
    why: Explanation,
    target: Coord,
): LossDiagnosis => ({
    kind,
    lesson: classifyLesson(layout, why),
    text: why.text,
    clues: why.clues,
    target,
    verdict: why.verdict,
});

/**
 * What the run should have done instead, or null if nothing was provable.
 *
 * Null should be unreachable on a no-guess board — more open cells never reduce
 * what is deducible — but it must go quiet rather than claim something false.
 */
export function diagnoseLoss(preLoss: Cell[][], revealed: Cell[][]): LossDiagnosis | null {
    const layout = positionToLayout(preLoss, revealed);

    const mine = detonatedMine(preLoss, revealed);
    if (mine) {
        const why = explain(layout, mine[0], mine[1]);
        if (why) return from('provable-mine', layout, why, mine);
    }

    const hint = namedPatternHint(layout) ?? nextHint(layout, []);
    return hint ? from('guess', layout, hint.why, hint.at) : null;
}
