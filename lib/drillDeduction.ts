/** What a drill's opened cells prove, and whether a drill is honest. */

import type { Coord, Drill, LessonId } from './drills';

export type RuleId = 'counting' | 'subset';

const ALL_RULES: readonly RuleId[] = ['counting', 'subset'];

export interface LessonRules {
    /** deduce restricted to these must still reach the solution. */
    allow: readonly RuleId[];
    /** Dropping any one of these must leave the drill unsolved. */
    require: readonly RuleId[];
}

export const LESSON_RULES: Record<LessonId, LessonRules> = {
    'counting': { allow: ['counting'], require: ['counting'] },
    'one-one': { allow: ALL_RULES, require: ['subset'] },
    'one-two': { allow: ALL_RULES, require: ['subset'] },
    'one-two-one': { allow: ALL_RULES, require: ['subset'] },
    'one-two-two-one': { allow: ALL_RULES, require: ['subset'] },
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
}

/** Every mine/safe cell provable from the OPENED cells using only `rules`. */
export function deduce(
    layout: readonly string[],
    rules: readonly RuleId[] = ALL_RULES,
): { mines: Coord[]; safe: Coord[] } {
    const rows = layout.length;
    const cols = rows === 0 ? 0 : layout[0].length;
    const known = new Map<string, 'mine' | 'safe'>();
    const at = (r: number, c: number) => layout[r][c];

    const prove = (cells: string[], verdict: 'mine' | 'safe') => {
        let hit = false;
        for (const k of cells) {
            if (known.get(k) === verdict) continue;
            known.set(k, verdict);
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
                let remaining = ch === '.' ? 0 : Number(ch);
                const unknown: string[] = [];
                for (const [nr, nc] of neighbours(rows, cols, r, c)) {
                    if (!COVERED.has(at(nr, nc))) continue;
                    const k = key(nr, nc);
                    const state = known.get(k);
                    if (state === 'mine') remaining--;
                    else if (state !== 'safe') unknown.push(k);
                }
                if (unknown.length > 0) out.push({ remaining, unknown });
            }
        }
        return out;
    }

    let changed = true;
    while (changed) {
        changed = false;
        const open = constraints();

        if (rules.includes('counting')) {
            for (const { remaining, unknown } of open) {
                if (remaining === 0) changed = prove(unknown, 'safe') || changed;
                else if (remaining === unknown.length) changed = prove(unknown, 'mine') || changed;
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
                    if (delta === extra.length) changed = prove(extra, 'mine') || changed;
                    else if (delta === 0) changed = prove(extra, 'safe') || changed;
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
    return { mines, safe };
}

/** How many mines a cell touches, from the layout's `*` positions. */
export function adjacentMines(layout: readonly string[], r: number, c: number): number {
    const cols = layout.length === 0 ? 0 : layout[0].length;
    return neighbours(layout.length, cols, r, c)
        .filter(([nr, nc]) => layout[nr][nc] === '*').length;
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
    if (problems.length > 0) return problems;

    const { allow, require } = LESSON_RULES[drill.lesson];
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

    return problems;
}
