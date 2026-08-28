/** What a drill's opened cells prove, and whether a drill is honest. */

import type { Coord, Drill, LessonId } from './drills';

export type RuleId = 'counting' | 'subset';

const ALL_RULES: readonly RuleId[] = ['counting', 'subset'];

export interface LessonRules {
    /** deduce restricted to these must still reach the solution. */
    allow: readonly RuleId[];
    /** Dropping any one of these must leave the drill unsolved. */
    require: readonly RuleId[];
    /**
     * Digits that must appear in a row or column of the board, so a drill
     * actually shows the shape its lesson is named after. NECESSARY, not
     * sufficient — '1211' contains '11' as well as '12' — which is why
     * `firstSubset` carries the other half of the distinction.
     */
    pattern?: string;
    /**
     * What the FIRST subset step must prove. The 1-1 rule is the equal-counts
     * case and proves cells safe; the 1-2 family differs by the count and
     * proves mines. This is the one structural difference between them that
     * does not depend on reading the digits.
     */
    firstSubset?: 'mine' | 'safe';
}

export const LESSON_RULES: Record<LessonId, LessonRules> = {
    'counting': { allow: ['counting'], require: ['counting'] },
    'one-one': { allow: ALL_RULES, require: ['subset'], pattern: '11', firstSubset: 'safe' },
    'one-two': { allow: ALL_RULES, require: ['subset'], pattern: '12', firstSubset: 'mine' },
    'one-two-one': { allow: ALL_RULES, require: ['subset'], pattern: '121', firstSubset: 'mine' },
    'one-two-two-one': { allow: ALL_RULES, require: ['subset'], pattern: '1221', firstSubset: 'mine' },
    // The general rule, so neither shape nor direction is constrained.
    'reduction': { allow: ALL_RULES, require: ['subset'] },
};

const COVERED = new Set(['#', '*']);

const key = (r: number, c: number) => `${r},${c}`;

function neighbours(rows: number, cols: number, r: number, c: number): Coord[] {
    const out: Coord[] = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push([nr, nc]);
        }
    }
    return out;
}

/** An opened cell's outstanding mine count over its still-unknown neighbours. */
interface Constraint {
    remaining: number;
    unknown: string[];
    /** The opened cell itself, so an explanation can point at it. */
    at: Coord;
    digit: number;
}

/** Why a cell is provable, in words the player can check on the board. */
export interface Explanation {
    verdict: 'mine' | 'safe';
    rule: RuleId;
    text: string;
}

const where = ([r, c]: Coord) => `row ${r + 1}, column ${c + 1}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const nameOf = (digit: number, at: Coord) =>
    digit === 0 ? `blank cell at ${where(at)}` : `${digit} at ${where(at)}`;

function run(layout: readonly string[], rules: readonly RuleId[]) {
    const rows = layout.length;
    const cols = rows === 0 ? 0 : layout[0].length;
    const known = new Map<string, 'mine' | 'safe'>();
    const why = new Map<string, Explanation>();
    const at = (r: number, c: number) => layout[r][c];

    const prove = (cells: string[], verdict: 'mine' | 'safe', reason: () => Explanation) => {
        let hit = false;
        for (const k of cells) {
            if (known.get(k) === verdict) continue;
            known.set(k, verdict);
            why.set(k, reason());
            hit = true;
        }
        return hit;
    };

    function constraints(): Constraint[] {
        const out: Constraint[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const ch = at(r, c);
                if (COVERED.has(ch)) continue;
                const digit = ch === '.' ? 0 : Number(ch);
                let remaining = digit;
                const unknown: string[] = [];
                for (const [nr, nc] of neighbours(rows, cols, r, c)) {
                    if (!COVERED.has(at(nr, nc))) continue;
                    const k = key(nr, nc);
                    const state = known.get(k);
                    if (state === 'mine') remaining--;
                    else if (state !== 'safe') unknown.push(k);
                }
                if (unknown.length > 0) out.push({ remaining, unknown, at: [r, c], digit });
            }
        }
        return out;
    }

    let changed = true;
    while (changed) {
        changed = false;
        const open = constraints();

        if (rules.includes('counting')) {
            for (const con of open) {
                const { remaining, unknown } = con;
                if (remaining === 0) {
                    changed = prove(unknown, 'safe', () => ({
                        verdict: 'safe',
                        rule: 'counting',
                        text: con.digit === 0
                            ? `The ${nameOf(0, con.at)} touches no mines at all, so every covered cell around it is safe.`
                            : `The ${nameOf(con.digit, con.at)} has already found ${plural(con.digit, 'its mine', 'all of its mines')}, so its remaining covered ${plural(unknown.length, 'cell is', 'cells are')} safe.`,
                    })) || changed;
                } else if (remaining === unknown.length) {
                    changed = prove(unknown, 'mine', () => ({
                        verdict: 'mine',
                        rule: 'counting',
                        text: `The ${nameOf(con.digit, con.at)} still needs ${remaining} more ${plural(remaining, 'mine', 'mines')} and touches only ${unknown.length} covered ${plural(unknown.length, 'cell', 'cells')}, so ${plural(unknown.length, 'it is a mine', 'they are all mines')}.`,
                    })) || changed;
                }
            }
        }

        if (rules.includes('subset')) {
            for (const a of open) {
                for (const b of open) {
                    if (a === b || a.unknown.length >= b.unknown.length) continue;
                    const inB = new Set(b.unknown);
                    if (!a.unknown.every((k) => inB.has(k))) continue;
                    const extra = b.unknown.filter((k) => !a.unknown.includes(k));
                    const delta = b.remaining - a.remaining;
                    if (delta === extra.length) {
                        changed = prove(extra, 'mine', () => ({
                            verdict: 'mine',
                            rule: 'subset',
                            text: `The ${nameOf(b.digit, b.at)} needs ${delta} more ${plural(delta, 'mine', 'mines')} than the ${nameOf(a.digit, a.at)}, and sees exactly ${extra.length} covered ${plural(extra.length, 'cell', 'cells')} that one cannot — so ${plural(extra.length, 'that cell is a mine', 'those cells are all mines')}.`,
                        })) || changed;
                    } else if (delta === 0) {
                        changed = prove(extra, 'safe', () => ({
                            verdict: 'safe',
                            rule: 'subset',
                            text: `The ${nameOf(a.digit, a.at)} and the ${nameOf(b.digit, b.at)} want the same number of mines, and every cell the first can see the second can see too — so the ${plural(extra.length, 'extra cell is', 'extra cells are')} safe.`,
                        })) || changed;
                    }
                }
            }
        }
    }

    const mines: Coord[] = [];
    const safe: Coord[] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const state = known.get(key(r, c));
            if (state) (state === 'mine' ? mines : safe).push([r, c]);
        }
    }
    return { mines, safe, why };
}

/** Every mine/safe cell provable from the OPENED cells using only `rules`. */
export function deduce(
    layout: readonly string[],
    rules: readonly RuleId[] = ALL_RULES,
): { mines: Coord[]; safe: Coord[] } {
    const { mines, safe } = run(layout, rules);
    return { mines, safe };
}

/** Why one cell is provable, or null if nothing proves it. */
export function explain(
    layout: readonly string[],
    row: number,
    col: number,
    rules: readonly RuleId[] = ALL_RULES,
): Explanation | null {
    return run(layout, rules).why.get(key(row, col)) ?? null;
}

/** How many mines a cell touches, from the layout's `*` positions. */
export function adjacentMines(layout: readonly string[], r: number, c: number): number {
    const cols = layout.length === 0 ? 0 : layout[0].length;
    return neighbours(layout.length, cols, r, c)
        .filter(([nr, nc]) => layout[nr][nc] === '*').length;
}

/** Rows and columns as strings, so a pattern can be read in either direction. */
function lines(layout: readonly string[]): string[] {
    const cols = layout.length === 0 ? 0 : layout[0].length;
    const down = Array.from({ length: cols }, (_, c) => layout.map((row) => row[c]).join(''));
    return [...layout, ...down];
}

const LEGAL = new Set(['.', '#', '*', '1', '2', '3', '4', '5', '6', '7', '8']);

const fmt = ([r, c]: Coord) => `(${r},${c})`;

/** Whether a drill's numbers, mines, solution and lesson all agree. `[]` means valid. */
export function validateDrill(drill: Drill): string[] {
    const { layout, solution } = drill;
    const problems: string[] = [];
    const rows = layout.length;
    const cols = rows === 0 ? 0 : layout[0].length;

    if (rows === 0 || cols === 0) return ['layout is empty'];
    for (let r = 0; r < rows; r++) {
        if (layout[r].length !== cols) {
            problems.push(`row ${r} is ragged: length ${layout[r].length}, expected ${cols}`);
        }
        for (const ch of layout[r]) {
            if (!LEGAL.has(ch)) problems.push(`row ${r} has an unknown character '${ch}'`);
        }
    }
    if (problems.length > 0) return problems;

    const at = (r: number, c: number) => layout[r][c];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const ch = at(r, c);
            if (COVERED.has(ch) || ch === '.') continue;
            const actual = adjacentMines(layout, r, c);
            if (actual !== Number(ch)) {
                problems.push(`${fmt([r, c])} shows ${ch} but touches ${actual} mines`);
            }
        }
    }

    const inBounds = ([r, c]: Coord) => r >= 0 && r < rows && c >= 0 && c < cols;
    for (const [label, cells] of [['flag', solution.flag], ['open', solution.open]] as const) {
        for (const cell of cells) {
            if (!inBounds(cell)) {
                problems.push(`${label} ${fmt(cell)} is off the board`);
                continue;
            }
            const ch = at(cell[0], cell[1]);
            if (label === 'flag' && ch !== '*') problems.push(`flag ${fmt(cell)} is not a mine`);
            if (label === 'open' && ch !== '#') problems.push(`open ${fmt(cell)} is not a covered safe cell`);
        }
    }
    if (problems.length > 0) return problems;

    const provable = deduce(layout);
    const compare = (kind: string, found: Coord[], declared: readonly Coord[]) => {
        const declaredKeys = new Set(declared.map(([r, c]) => key(r, c)));
        const foundKeys = new Set(found.map(([r, c]) => key(r, c)));
        for (const cell of found) {
            if (!declaredKeys.has(key(cell[0], cell[1]))) {
                problems.push(`solution omits provable ${kind} ${fmt(cell)}`);
            }
        }
        for (const cell of declared) {
            if (!foundKeys.has(key(cell[0], cell[1]))) {
                problems.push(`solution claims ${kind} ${fmt(cell)}, which is not provable`);
            }
        }
    };
    compare('mine', provable.mines, solution.flag);
    compare('safe', provable.safe, solution.open);

    /*
     * Every mine must be provable, not just the declared ones. An undeducible
     * mine takes a lucky flag — ground truth calls it correct — but is absent
     * from the solution, so the marked set can never equal it and the drill
     * cannot be finished.
     */
    const provenMines = new Set(provable.mines.map(([r, c]) => key(r, c)));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (at(r, c) === '*' && !provenMines.has(key(r, c))) {
                problems.push(`mine ${fmt([r, c])} is not deducible, so the drill cannot be finished`);
            }
        }
    }

    /*
     * A covered cell nothing can reach is never flagged and never opened, so
     * the board can be "solved" with it still sitting there looking unfinished.
     */
    const settled = new Set([...provable.mines, ...provable.safe].map(([r, c]) => key(r, c)));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (COVERED.has(at(r, c)) && !settled.has(key(r, c))) {
                problems.push(`covered cell ${fmt([r, c])} can never be resolved, so the drill cannot be finished`);
            }
        }
    }
    if (problems.length > 0) return problems;

    const { allow, require, pattern, firstSubset } = LESSON_RULES[drill.lesson];
    const solves = (rules: readonly RuleId[]) => {
        const p = deduce(layout, rules);
        const same = (found: Coord[], declared: readonly Coord[]) =>
            found.length === declared.length
            && found.every(([r, c]) => declared.some(([dr, dc]) => dr === r && dc === c));
        return same(p.mines, solution.flag) && same(p.safe, solution.open);
    };

    if (!solves(allow)) {
        problems.push(`lesson ${drill.lesson} cannot reach this solution with only: ${allow.join(', ')}`);
    }
    for (const rule of require) {
        const without = allow.filter((r) => r !== rule);
        if (solves(without)) {
            problems.push(`lesson ${drill.lesson} never needs ${rule}: ${without.join(', ') || 'no rule'} already solves it`);
        }
    }

    if (pattern && !lines(layout).some((line) => line.includes(pattern))) {
        problems.push(`lesson ${drill.lesson} expects the pattern ${pattern} in some row or column, and it appears in none`);
    }

    if (firstSubset) {
        const first = [...run(layout, allow).why.values()].find((w) => w.rule === 'subset');
        if (first && first.verdict !== firstSubset) {
            problems.push(`lesson ${drill.lesson} should open with a first subset step proving a ${firstSubset}, but this board's proves a cell ${first.verdict}`);
        }
    }

    return problems;
}

/**
 * The next cell worth pointing at, in DEDUCTION order rather than board order —
 * a hint should offer the step the rules reach next, not whichever cell happens
 * to come first on the board.
 */
export function nextHint(
    layout: readonly string[],
    done: readonly Coord[],
    rules: readonly RuleId[] = ALL_RULES,
): { at: Coord; why: Explanation } | null {
    const settled = new Set(done.map(([r, c]) => key(r, c)));
    for (const [k, why] of run(layout, rules).why) {
        if (settled.has(k)) continue;
        const [r, c] = k.split(',');
        return { at: [Number(r), Number(c)], why };
    }
    return null;
}
