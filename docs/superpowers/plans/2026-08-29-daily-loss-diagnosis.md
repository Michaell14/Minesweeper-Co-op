# Daily Loss Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a daily-challenge run ends on a mine, name the deduction the player missed and link them to the drill that teaches it.

**Architecture:** Entirely client-side. At game over the server already sends the fully revealed board *before* the game-over event, so inside that one socket handler the store still holds the pre-loss position while the payload holds the truth. Those two boards are converted into the layout string format `lib/drillDeduction.ts` already understands, which finds what was provable and says why in a finished sentence. A new classifier names the pattern; a new overlay draws it on the replay board.

**Tech Stack:** TypeScript, React 18, Zustand, Tailwind (semantic classes only), Vitest (+ jsdom for component tests).

**Spec:** `docs/superpowers/specs/2026-08-29-daily-loss-diagnosis-design.md`

## Global Constraints

- **4-space indent.** No Prettier. Match the file you are editing.
- **Comments concise or omitted.** One short line when a constraint genuinely is not visible in the code. No multi-paragraph rationale blocks — rationale goes in the commit message. This overrides the older heavily-annotated style in surrounding files; do not rewrite existing comments.
- **Never write a raw colour, font size or border width.** Inside `components/ds/` read tokens as CSS custom properties; everywhere else use the Tailwind semantic classes (`text-pixel-sm`, `text-ink-muted`). In `.module.css` read `var(--ms-*)` directly.
- **Anything that animates reads a `--ms-duration-*` token**, and follows `board.module.css`'s existing `@media (prefers-reduced-motion: reduce) { animation: none }` pattern.
- **Build UI from `components/ds/`**, imported from `@/components/ds`.
- **Client imports use the `@/` alias.**
- **Do not touch `server/`, `shared/`, or `server/domain/solverUtils.js`.** This feature has no server surface. `solveWithStats` decides which boards generate at all and which layout the daily picks; refactoring it to share rule code would change the boards that ship.
- **Component tests need `// @vitest-environment jsdom` as the first line of the file.** Pure-logic tests must not have it.
- Verification commands: `npm run test:client`, `npx tsc --noEmit`, `npm run lint`. Run `npm run test:ui` once at the end (Task 7) since `components/` and `hooks/` are touched; it needs `npm run dev:all` running.

---

### Task 1: `Explanation` carries the cells that prove it

`explain()` already returns a sentence naming the opened cells that prove a deduction, but only inside its prose. The classifier in Task 3 and the overlay in Task 7 both need those coordinates structurally.

**Files:**
- Modify: `lib/drillDeduction.ts` (the `Explanation` interface, and the four `prove(...)` call sites inside `run()`)
- Test: `lib/drillDeduction.test.ts` (exists — append)

**Interfaces:**
- Consumes: nothing.
- Produces: `Explanation` gains `clues: Coord[]` — one coordinate for a `counting` deduction (the number that proves it), two for a `subset` deduction (the smaller constraint then the larger). Existing consumers `components/drills/DrillRunner.tsx` and `lib/drills.test.ts` read only `.text` and `.at` and must keep passing untouched.

- [ ] **Step 1: Write the failing tests**

`lib/drillDeduction.test.ts` already exists and already imports
`describe, expect, test` from vitest and `deduce, explain` from
`./drillDeduction`. Add `DRILLS` to its existing `./drills` import, which today
reads `import type { Drill } from './drills';` — it becomes two lines:

```ts
import { DRILLS } from './drills';
import type { Drill } from './drills';
```

Then append this block to the end of the file:

```ts
describe('an explanation names the cells that prove it', () => {
    /* counting-a is ['*1.', '11.', '...'] — the scan reaches the 1 at (0,1)
       first, and it is the only cell touching the mine at (0,0). */
    test('a counting deduction cites the one number that proves it', () => {
        const why = explain(['*1.', '11.', '...'], 0, 0);

        expect(why?.rule).toBe('counting');
        expect(why?.clues).toEqual([[0, 1]]);
    });

    test('a subset deduction cites both numbers', () => {
        for (const drill of DRILLS) {
            const { mines, safe } = deduce(drill.layout);
            for (const [r, c] of [...mines, ...safe]) {
                const why = explain(drill.layout, r, c);
                if (why?.rule !== 'subset') continue;
                expect({ id: drill.id, n: why.clues.length }).toEqual({ id: drill.id, n: 2 });
            }
        }
    });

    /* A clue is something the player can read off the board, so it must be an
       opened cell — never one of the covered cells the deduction is about. */
    test('every clue points at an opened cell', () => {
        for (const drill of DRILLS) {
            const { mines, safe } = deduce(drill.layout);
            for (const [r, c] of [...mines, ...safe]) {
                const why = explain(drill.layout, r, c);
                expect(why).not.toBeNull();
                for (const [cr, cc] of why!.clues) {
                    expect({ id: drill.id, ch: drill.layout[cr][cc] }).not.toEqual(
                        { id: drill.id, ch: '#' },
                    );
                    expect({ id: drill.id, ch: drill.layout[cr][cc] }).not.toEqual(
                        { id: drill.id, ch: '*' },
                    );
                }
            }
        }
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/drillDeduction.test.ts`
Expected: FAIL — `why?.clues` is `undefined`, so the first test reports `undefined` where `[[0, 1]]` was expected. TypeScript will also flag `clues` as not existing on `Explanation`.

- [ ] **Step 3: Add the field to the interface**

In `lib/drillDeduction.ts`, extend `Explanation`:

```ts
/** Why a cell is provable, in words the player can check on the board. */
export interface Explanation {
    verdict: 'mine' | 'safe';
    rule: RuleId;
    text: string;
    /** The opened cells that prove it: one for counting, two for subset. */
    clues: Coord[];
}
```

- [ ] **Step 4: Populate it at all four `prove(...)` call sites**

Inside `run()`, add `clues` to each of the four returned explanation objects. In the `counting` block both sites use the single constraint:

```ts
                if (remaining === 0) {
                    changed = prove(unknown, 'safe', () => ({
                        verdict: 'safe',
                        rule: 'counting',
                        clues: [con.at],
                        text: con.digit === 0
```

```ts
                } else if (remaining === unknown.length) {
                    changed = prove(unknown, 'mine', () => ({
                        verdict: 'mine',
                        rule: 'counting',
                        clues: [con.at],
                        text: `The ${nameOf(con.digit, con.at)} still needs ${remaining} more ${plural(remaining, 'mine', 'mines')}
```

In the `subset` block both sites cite the smaller constraint then the larger, matching the order the prose names them:

```ts
                    if (delta === extra.length) {
                        changed = prove(extra, 'mine', () => ({
                            verdict: 'mine',
                            rule: 'subset',
                            clues: [a.at, b.at],
                            text: `The ${nameOf(b.digit, b.at)} needs ${delta} more
```

```ts
                    } else if (delta === 0) {
                        changed = prove(extra, 'safe', () => ({
                            verdict: 'safe',
                            rule: 'subset',
                            clues: [a.at, b.at],
                            text: `The ${nameOf(a.digit, a.at)} and the ${nameOf(b.digit, b.at)}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/drillDeduction.test.ts lib/drills.test.ts`
Expected: PASS, including the pre-existing `lib/drills.test.ts` suite.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/drillDeduction.ts lib/drillDeduction.test.ts
git commit -m "Let an explanation say which cells prove it

The prose already names them; nothing could read them back out. The loss
diagnosis needs them structurally, to name the pattern and to outline it on the
board. Additive: DrillRunner reads only .text and .at."
```

---

### Task 2: The adapter — a live position as a drill layout

**Files:**
- Create: `lib/lossDiagnosis.ts`
- Test: `lib/lossDiagnosis.test.ts`

**Interfaces:**
- Consumes: `Cell` from `@/state/types` — `{ isMine, isOpen, isFlagged, nearbyMines }`.
- Produces: `positionToLayout(preLoss: Cell[][], revealed: Cell[][]): string[]`, emitting the layout format `lib/drillDeduction.ts` consumes: `.` opened zero, `1`-`8` opened number, `#` covered safe, `*` covered mine.

- [ ] **Step 1: Write the failing test**

Create `lib/lossDiagnosis.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import type { Cell } from '@/state/types';
import { positionToLayout } from './lossDiagnosis';

const open = (nearbyMines: number): Cell => ({ isMine: false, isOpen: true, isFlagged: false, nearbyMines });
/* preLoss never carries mine truth: projectCell zeroes it for closed cells. */
const covered = (isFlagged = false): Cell =>
    ({ isMine: false, isOpen: false, isFlagged, nearbyMines: 0 });
const truth = (isMine: boolean): Cell => ({ isMine, isOpen: false, isFlagged: false, nearbyMines: 0 });

describe('turning a live position into a drill layout', () => {
    test('opened cells become their digit, and zero becomes a dot', () => {
        const preLoss = [[open(0), open(1), open(2)]];
        const revealed = [[truth(false), truth(false), truth(false)]];

        expect(positionToLayout(preLoss, revealed)).toEqual(['.12']);
    });

    test('covered cells take their mine truth from the revealed board', () => {
        const preLoss = [[covered(), covered()]];
        const revealed = [[truth(true), truth(false)]];

        expect(positionToLayout(preLoss, revealed)).toEqual(['*#']);
    });

    /* deduce() re-derives everything from opened numbers, so a flag the player
       got wrong must not reach it and make the diagnosis lie. */
    test('a flag on a safe cell is ignored, not treated as a mine', () => {
        const preLoss = [[covered(true)]];
        const revealed = [[truth(false)]];

        expect(positionToLayout(preLoss, revealed)).toEqual(['#']);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/lossDiagnosis.test.ts`
Expected: FAIL — cannot resolve `./lossDiagnosis`.

- [ ] **Step 3: Write the implementation**

Create `lib/lossDiagnosis.ts`:

```ts
/** Naming the deduction a lost run missed, and the drill that teaches it. */

import type { Cell } from '@/state/types';

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/lossDiagnosis.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/lossDiagnosis.ts lib/lossDiagnosis.test.ts
git commit -m "Read a live position as a drill layout

drillDeduction is not drill-specific — it takes a layout string of any size.
This is the whole adapter between a finished game board and it."
```

---

### Task 3: Name the pattern

The one genuinely new piece of reasoning. Classifying from the deduction's structure alone cannot work: a 1-2-1 *is* two overlapping 1-2 subset steps, so every 1-2-1 would report as a 1-2 and the marquee case would never fire. Instead, read the run of opened digits along the line through the clue cells and match longest-first.

**Files:**
- Modify: `lib/lossDiagnosis.ts`
- Test: `lib/lossDiagnosis.test.ts`

**Interfaces:**
- Consumes: `Explanation` (Task 1), `LESSON_RULES` and `RuleId` from `@/lib/drillDeduction`, `LessonId` and `Coord` from `@/lib/drills`.
- Produces: `classifyLesson(layout: readonly string[], why: Explanation): LessonId`, returning one of `'counting'`, `'one-one'`, `'one-two'`, `'one-two-one'`, `'one-two-two-one'`, `'reduction'`. Never returns `'in-the-wild'` — that lesson is a collection of boards, not a shape.

- [ ] **Step 1: Write the failing tests**

Append to `lib/lossDiagnosis.test.ts`:

```ts
import type { Explanation } from './drillDeduction';
import type { Coord } from './drills';
import { classifyLesson } from './lossDiagnosis';

const why = (
    rule: 'counting' | 'subset',
    verdict: 'mine' | 'safe',
    clues: Coord[],
): Explanation => ({ rule, verdict, clues, text: '' });

describe('naming the pattern behind a deduction', () => {
    test('a counting step is the counting lesson, whatever is around it', () => {
        expect(classifyLesson(['1221', '####'], why('counting', 'mine', [[0, 1]]))).toBe('counting');
    });

    test('reads 1-2-2-1 along a row', () => {
        expect(classifyLesson(['1221', '####'], why('subset', 'mine', [[0, 0], [0, 1]])))
            .toBe('one-two-two-one');
    });

    test('reads 1-2-1 along a row', () => {
        expect(classifyLesson(['121', '###'], why('subset', 'mine', [[0, 0], [0, 1]])))
            .toBe('one-two-one');
    });

    test('reads 1-2-1 down a column', () => {
        expect(classifyLesson(['1#', '2#', '1#'], why('subset', 'mine', [[0, 0], [1, 0]])))
            .toBe('one-two-one');
    });

    test('reads a plain 1-2', () => {
        expect(classifyLesson(['12.', '###'], why('subset', 'mine', [[0, 0], [0, 1]])))
            .toBe('one-two');
    });

    test('reads a plain 1-1', () => {
        expect(classifyLesson(['11.', '###'], why('subset', 'safe', [[0, 0], [0, 1]])))
            .toBe('one-one');
    });

    /* The match has to cover the cells that actually fired, or a shape
       elsewhere in the same row names a pattern that had nothing to do with
       it. Here "112" contains "12", but not over the clues. */
    test('ignores a shape that does not span the clue cells', () => {
        expect(classifyLesson(['112', '###'], why('subset', 'safe', [[0, 0], [0, 1]])))
            .toBe('one-one');
    });

    test('reads a reflected 1-2 as a 1-2', () => {
        expect(classifyLesson(['.21', '###'], why('subset', 'mine', [[0, 1], [0, 2]])))
            .toBe('one-two');
    });

    /* 1-1 proves cells safe and 1-2 proves a mine. A two-digit run whose
       verdict disagrees is some other reduction wearing the same digits. */
    test('will not call it a 1-1 when it proved a mine', () => {
        expect(classifyLesson(['11.', '###'], why('subset', 'mine', [[0, 0], [0, 1]])))
            .toBe('reduction');
    });

    test('falls back to reduction when the clues are not on one line', () => {
        expect(classifyLesson(['12', '21'], why('subset', 'mine', [[0, 0], [1, 1]])))
            .toBe('reduction');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/lossDiagnosis.test.ts`
Expected: FAIL — `classifyLesson` is not exported from `./lossDiagnosis`.

- [ ] **Step 3: Write the implementation**

Append to `lib/lossDiagnosis.ts` (and extend the import line at the top):

```ts
import { LESSON_RULES, type Explanation } from './drillDeduction';
import type { Coord, LessonId } from './drills';
```

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/lossDiagnosis.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/lossDiagnosis.ts lib/lossDiagnosis.test.ts
git commit -m "Name the shape a missed deduction was

Structural classification cannot do this: a 1-2-1 IS two overlapping 1-2 subset
steps, so every 1-2-1 would report as a 1-2 and the best case never fires.
Reads the digit run through the clue cells instead, longest match first, and
requires the match to span the cells that actually fired."
```

---

### Task 4: The diagnosis itself

**Files:**
- Modify: `lib/lossDiagnosis.ts`
- Test: `lib/lossDiagnosis.test.ts`

**Interfaces:**
- Consumes: `positionToLayout` (Task 2), `classifyLesson` (Task 3), `explain` and `nextHint` from `@/lib/drillDeduction`.
- Produces:
  - `interface LossDiagnosis { kind: 'provable-mine' | 'guess'; lesson: LessonId; text: string; clues: Coord[]; target: Coord; verdict: 'mine' | 'safe' }`
  - `diagnoseLoss(preLoss: Cell[][], revealed: Cell[][]): LossDiagnosis | null`
  - `shortLessonName(lesson: LessonId): string` — the phrase the dialog says, e.g. `'a 1-2-1'`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/lossDiagnosis.test.ts`:

```ts
import { diagnoseLoss, shortLessonName } from './lossDiagnosis';

/* Cells as the two boards hold them: `preLoss` is the client's own position
   before the fatal move, `revealed` is the payload with every mine in it. */
const pre = (isOpen: boolean, nearbyMines = 0): Cell =>
    ({ isMine: false, isOpen, isFlagged: false, nearbyMines });
const post = (isMine: boolean, isOpen: boolean, nearbyMines = 0): Cell =>
    ({ isMine, isOpen, isFlagged: false, nearbyMines });

describe('diagnosing a loss', () => {
    /*
     * A 1 with exactly one covered neighbour, which the player opened. The
     * mine was provable by counting.
     *   1 #        the # at (0,1) is the only cell the 1 can be counting
     *   . .
     */
    test('reports the mine you opened when it was provable', () => {
        const preLoss = [[pre(true, 1), pre(false)], [pre(true, 1), pre(true, 1)]];
        const revealed = [[post(false, true, 1), post(true, true)], [post(false, true, 1), post(false, true, 1)]];

        const result = diagnoseLoss(preLoss, revealed);

        expect(result?.kind).toBe('provable-mine');
        expect(result?.target).toEqual([0, 1]);
        expect(result?.verdict).toBe('mine');
        expect(result?.lesson).toBe('counting');
        expect(result?.text.length).toBeGreaterThan(0);
    });

    /*
     * The mine at (0,0) is genuinely undetermined — the two 1s below it both
     * see exactly {(0,0), (0,1)} and want one mine, so neither cell can be
     * separated from the other. Meanwhile the 0 at (0,3) proves three cells
     * safe. The player opened (0,0) with that move still on the table.
     *
     * As a layout:  *##.#
     *               11#..
     *               .....
     */
    test('points at a move that was certain when the one you took was not', () => {
        const preLoss = [
            [pre(false), pre(false), pre(false), pre(true, 0), pre(false)],
            [pre(true, 1), pre(true, 1), pre(false), pre(true, 0), pre(true, 0)],
            [pre(true, 0), pre(true, 0), pre(true, 0), pre(true, 0), pre(true, 0)],
        ];
        const revealed = [
            [post(true, true), post(false, false), post(false, false), post(false, true, 0), post(false, false)],
            [post(false, true, 1), post(false, true, 1), post(false, false), post(false, true, 0), post(false, true, 0)],
            [post(false, true, 0), post(false, true, 0), post(false, true, 0), post(false, true, 0), post(false, true, 0)],
        ];

        const result = diagnoseLoss(preLoss, revealed);

        expect(result?.kind).toBe('guess');
        expect(result?.verdict).toBe('safe');
        expect(result?.lesson).toBe('counting');
        // The 0 at (0,3) is scanned first and reaches (0,2) first.
        expect(result?.target).toEqual([0, 2]);
    });

    /* Nothing opened means nothing proves anything. It must go quiet rather
       than claim something false. */
    test('returns null when nothing at all was provable', () => {
        const preLoss = [[pre(false), pre(false)]];
        const revealed = [[post(true, true), post(false, false)]];

        expect(diagnoseLoss(preLoss, revealed)).toBeNull();
    });
});

describe('how a lesson is said out loud', () => {
    test('names the shapes the way a player would', () => {
        expect(shortLessonName('one-two-one')).toBe('a 1-2-1');
        expect(shortLessonName('one-two-two-one')).toBe('a 1-2-2-1');
        expect(shortLessonName('counting')).toBe('a counting step');
        expect(shortLessonName('reduction')).toBe('a subset reduction');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/lossDiagnosis.test.ts`
Expected: FAIL — `diagnoseLoss` and `shortLessonName` are not exported.

- [ ] **Step 3: Write the implementation**

Extend the `drillDeduction` import in `lib/lossDiagnosis.ts` and append:

```ts
import { LESSON_RULES, explain, nextHint, type Explanation } from './drillDeduction';
```

```ts
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

    const hint = nextHint(layout, []);
    return hint ? from('guess', layout, hint.why, hint.at) : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/lossDiagnosis.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/lossDiagnosis.ts lib/lossDiagnosis.test.ts
git commit -m "Diagnose a loss as either a misread or a guess

Two shapes, because they teach different things: the mine you opened was
provable, or it genuinely was not and a certain move sat elsewhere. The second
is expected to be the common one."
```

---

### Task 5: Compute it at the one moment both boards exist

**Files:**
- Modify: `state/dailySlice.ts`
- Modify: `hooks/useGameEvents.ts:471` (the `DAILY_BOARD_UPDATE` handler)
- Test: `state/dailySlice.test.ts` (does not exist — create)

**Interfaces:**
- Consumes: `diagnoseLoss` and `LossDiagnosis` (Task 4).
- Produces: `dailyDiagnosis: LossDiagnosis | null` on the store, plus `setDailyDiagnosis(diagnosis: LossDiagnosis | null): void`. Tasks 6 and 7 both read `state.dailyDiagnosis`.

- [ ] **Step 1: Write the failing test**

Create `state/dailySlice.test.ts`:

```ts
import { afterEach, describe, expect, test } from 'vitest';
import { useMinesweeperStore } from '@/app/store';
import type { LossDiagnosis } from '@/lib/lossDiagnosis';

const sample: LossDiagnosis = {
    kind: 'guess',
    lesson: 'one-two-one',
    text: 'because.',
    clues: [[0, 0], [0, 1]],
    target: [0, 2],
    verdict: 'safe',
};

afterEach(() => useMinesweeperStore.getState().resetDailyState());

describe('the loss diagnosis on the store', () => {
    test('starts empty', () => {
        expect(useMinesweeperStore.getState().dailyDiagnosis).toBeNull();
    });

    test('holds what the handler computed', () => {
        useMinesweeperStore.getState().setDailyDiagnosis(sample);

        expect(useMinesweeperStore.getState().dailyDiagnosis).toEqual(sample);
    });

    /* Leaving the daily must not leave last run's lesson on the next board. */
    test('is cleared when the daily view resets', () => {
        useMinesweeperStore.getState().setDailyDiagnosis(sample);

        useMinesweeperStore.getState().resetDailyState();

        expect(useMinesweeperStore.getState().dailyDiagnosis).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run state/dailySlice.test.ts`
Expected: FAIL — `dailyDiagnosis` is `undefined` and `setDailyDiagnosis` is not a function.

- [ ] **Step 3: Add the field to the slice**

In `state/dailySlice.ts`, add the import, the interface member, the initial value and the setter:

```ts
import type { LossDiagnosis } from '@/lib/lossDiagnosis';
```

In `interface DailySlice`, after `dailyLeaderboard`:

```ts
    /** What the losing move missed. Null until a run ends on a mine. */
    dailyDiagnosis: LossDiagnosis | null;
```

and with the other setters:

```ts
    setDailyDiagnosis: (diagnosis: LossDiagnosis | null) => void;
```

In `initialDailyState`, after `dailyLeaderboard: []`:

```ts
    dailyDiagnosis: null,
```

and in the creator, beside `setDailyLeaderboard`:

```ts
    setDailyDiagnosis: (diagnosis) => set({ dailyDiagnosis: diagnosis }),
```

`resetDailyState` already spreads `initialDailyState`, so it clears with no further change.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run state/dailySlice.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into the socket handler**

In `hooks/useGameEvents.ts`, add the import beside the other `@/lib` imports:

```ts
import { diagnoseLoss } from '@/lib/lossDiagnosis';
```

Replace the one-line handler at `hooks/useGameEvents.ts:471`:

```ts
    [SERVER_EVENTS.DAILY_BOARD_UPDATE]: ({ board }) => useMinesweeperStore.getState().setBoard(board),
```

with:

```ts
    /*
     * An open mine can only be a detonation — a win flags the remaining mines
     * without opening them. The store still holds the position the fatal move
     * was made from until setBoard below replaces it.
     */
    [SERVER_EVENTS.DAILY_BOARD_UPDATE]: ({ board }) => {
        const store = useMinesweeperStore.getState();
        if (board.some((row) => row.some((cell) => cell.isOpen && cell.isMine))) {
            store.setDailyDiagnosis(diagnoseLoss(store.board, board));
        }
        store.setBoard(board);
    },
```

- [ ] **Step 6: Verify nothing regressed and commit**

Run: `npm run test:client && npx tsc --noEmit && npm run lint`
Expected: all pass.

```bash
git add state/dailySlice.ts state/dailySlice.test.ts hooks/useGameEvents.ts
git commit -m "Diagnose the loss where both boards exist at once

The revealed board arrives before the game-over event, so inside this one
handler the store still holds the pre-loss position and the payload holds the
truth. A losing move never emits an incremental update, so that position is
genuinely pre-move even for a chord that opened safe cells before detonating."
```

---

### Task 6: Say it in the game-over dialog

**Files:**
- Modify: `components/dialogs/DailyDialogs.tsx` (the `DIALOGS.dailyGameOver` dialog body, around line 212)
- Test: `components/dialogs/DailyDialogs.test.tsx` (exists — append)

**Interfaces:**
- Consumes: `state.dailyDiagnosis` (Task 5), `shortLessonName` (Task 4), `ButtonLink` from `@/components/ds`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

`components/dialogs/DailyDialogs.test.tsx` already exists. It renders ALL four
dialogs and opens one explicitly via its own `renderOpen(id)` helper — a closed
`<dialog>`'s contents are excluded from the accessibility tree, so `getByRole`
finds nothing without it. Its `beforeEach` already seeds a failed run and its
`afterEach` already calls `resetDailyState`, which clears the diagnosis too.

Add the import of the type at the top of the file:

```tsx
import type { LossDiagnosis } from "@/lib/lossDiagnosis";
```

Then append this block, reusing the existing `renderOpen`:

```tsx
const diagnosis = (over: Partial<LossDiagnosis> = {}): LossDiagnosis => ({
    kind: "provable-mine",
    lesson: "one-two-one",
    text: "The 2 at row 7, column 4 is flanked by two 1s.",
    clues: [[6, 3], [6, 1]],
    target: [6, 5],
    verdict: "mine",
    ...over,
});

describe("dailyGameOver: the deduction the run missed", () => {
    test("names the pattern and links to its drill", () => {
        useMinesweeperStore.getState().setDailyDiagnosis(diagnosis());

        const dialog = renderOpen(DIALOGS.dailyGameOver);

        expect(within(dialog).getByText(/1-2-1/)).toBeDefined();
        expect(
            screen.getByRole("link", { name: "Practise a 1-2-1" }).getAttribute("href"),
        ).toBe("/drills/one-two-one");
    });

    test("explains why, in the engine's own words", () => {
        useMinesweeperStore.getState().setDailyDiagnosis(diagnosis());

        const dialog = renderOpen(DIALOGS.dailyGameOver);

        expect(within(dialog).getByText(/flanked by two 1s/)).toBeDefined();
    });

    /* A guess and a misread read differently: one names what they missed on
       the cell they took, the other points at the move they had instead. */
    test("says something different when the cell they took was not provable", () => {
        useMinesweeperStore.getState().setDailyDiagnosis(
            diagnosis({ kind: "guess", lesson: "counting", verdict: "safe" }),
        );

        const dialog = renderOpen(DIALOGS.dailyGameOver);

        expect(within(dialog).getByText(/Nothing proved that cell/)).toBeDefined();
        expect(screen.getByRole("link", { name: "Practise a counting step" })).toBeDefined();
    });

    test("adds nothing when there is no diagnosis", () => {
        renderOpen(DIALOGS.dailyGameOver);

        expect(screen.queryByRole("link", { name: /Practise/ })).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/dialogs/DailyDialogs.test.tsx`
Expected: FAIL — no link matching `/practise/i` is rendered.

- [ ] **Step 3: Write the implementation**

In `components/dialogs/DailyDialogs.tsx`, extend the design-system import, add two more imports, and read the new store field beside the other daily selectors:

```tsx
import { Button, ButtonLink, DialogClose, Dialog, Field, Input, NameWithAvatar, Table } from '@/components/ds';
import { shortLessonName } from '@/lib/lossDiagnosis';
```

```tsx
    const dailyDiagnosis = useMinesweeperStore((state) => state.dailyDiagnosis);
```

Replace the body of the `DIALOGS.dailyGameOver` dialog — currently the single line:

```tsx
                <p className="text-pixel-sm">You hit a mine at <strong>{elapsedLabel}</strong>. Come back tomorrow for a new puzzle!</p>
```

with:

```tsx
                <p className="text-pixel-sm">You hit a mine at <strong>{elapsedLabel}</strong>. Come back tomorrow for a new puzzle!</p>
                {dailyDiagnosis && (
                    <div className="mt-4 flex flex-col items-start gap-2">
                        <p className="text-pixel-sm">
                            {dailyDiagnosis.kind === 'provable-mine' ? (
                                <>You missed <strong>{shortLessonName(dailyDiagnosis.lesson)}</strong>.</>
                            ) : (
                                <>Nothing proved that cell — but <strong>{shortLessonName(dailyDiagnosis.lesson)}</strong> was there.</>
                            )}
                        </p>
                        <p className="text-pixel-xs text-ink-muted">{dailyDiagnosis.text}</p>
                        <ButtonLink
                            href={`/drills/${dailyDiagnosis.lesson}`}
                            size="sm"
                            aria-label={`Practise ${shortLessonName(dailyDiagnosis.lesson)}`}>
                            Drill it
                        </ButtonLink>
                    </div>
                )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/dialogs/DailyDialogs.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck, lint and commit**

```bash
npx tsc --noEmit && npm run lint
git add components/dialogs/DailyDialogs.tsx components/dialogs/DailyDialogs.test.tsx
git commit -m "Offer the drill for the pattern the run missed

Two wordings, because a misread and a guess are different lessons. The link is
a ButtonLink, not a Button with a push: the drill is a real crawlable page and
should middle-click like one."
```

---

### Task 7: Draw it on the replay board

The daily leaves its board mounted and view-only after a loss, which is the whole reason this mode went first. The highlight must outlive the dialog.

**Files:**
- Create: `components/game/DeductionLayer.tsx`
- Modify: `components/game/board.module.css` (append)
- Modify: `components/game/Board.tsx` (mount beside the other two overlays)
- Test: `components/game/DeductionLayer.test.tsx`

**Interfaces:**
- Consumes: `state.dailyDiagnosis` (Task 5), `useCellMetrics` from `./useCellMetrics`.
- Produces: default-exported `DeductionLayer({ boardRef }: { boardRef: React.RefObject<HTMLDivElement | null> })`.

- [ ] **Step 1: Write the failing test**

Create `components/game/DeductionLayer.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * jsdom has no layout engine, so this asserts what is mounted and how many —
 * never where. The geometry is the same measured-metrics technique CursorLayer
 * and KeyboardCursor use and is checked by eye.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import type { LossDiagnosis } from '@/lib/lossDiagnosis';
import DeductionLayer from './DeductionLayer';

const sample: LossDiagnosis = {
    kind: 'provable-mine',
    lesson: 'one-two-one',
    text: 'because.',
    clues: [[1, 1], [1, 3]],
    target: [1, 2],
    verdict: 'mine',
};

const renderLayer = () => {
    const ref = React.createRef<HTMLDivElement>();
    return render(<div ref={ref}><DeductionLayer boardRef={ref} /></div>);
};

afterEach(() => {
    cleanup();
    useMinesweeperStore.getState().resetDailyState();
});

describe('the deduction overlay', () => {
    test('draws nothing at all when no run has been diagnosed', () => {
        const { container } = renderLayer();

        expect(container.querySelector('[data-deduction]')).toBeNull();
    });

    test('marks every clue cell and the target', () => {
        useMinesweeperStore.getState().setDailyDiagnosis(sample);

        const { container } = renderLayer();

        expect(container.querySelectorAll('[data-deduction="clue"]').length).toBe(2);
        expect(container.querySelectorAll('[data-deduction="target"]').length).toBe(1);
    });

    /* Decorative: the dialog carries the same information as text, and a
       screen reader should not have to walk three empty boxes. */
    test('is hidden from assistive tech', () => {
        useMinesweeperStore.getState().setDailyDiagnosis(sample);

        const { container } = renderLayer();

        expect(container.querySelector('[data-deduction-layer]')?.getAttribute('aria-hidden'))
            .toBe('true');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/game/DeductionLayer.test.tsx`
Expected: FAIL — cannot resolve `./DeductionLayer`.

- [ ] **Step 3: Write the component**

Create `components/game/DeductionLayer.tsx`:

```tsx
"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import type { Coord } from '@/lib/drills';
import { useCellMetrics } from './useCellMetrics';
import styles from './board.module.css';

interface DeductionLayerProps {
    boardRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The deduction a lost daily run missed, drawn over the finished board.
 *
 * An overlay rather than cell props: a board holds up to 512 memoized cells,
 * and marking three of them is not worth a prop on every one. Same measured
 * geometry as CursorLayer — the cell size token is a clamp() and cannot be
 * parsed.
 */
export default function DeductionLayer({ boardRef }: DeductionLayerProps) {
    const diagnosis = useMinesweeperStore((state) => state.dailyDiagnosis);
    const metrics = useCellMetrics(boardRef);

    if (!diagnosis) return null;

    const stride = metrics.size + metrics.gap;
    // The board's own padding equals --cell-gap, so cell (0,0) starts one gap in.
    const box = ([r, c]: Coord) => ({
        transform: `translate(${metrics.gap + c * stride}px, ${metrics.gap + r * stride}px)`,
        width: metrics.size,
        height: metrics.size,
    });

    return (
        <div className={styles.deductionLayer} data-deduction-layer aria-hidden="true">
            {diagnosis.clues.map(([r, c]) => (
                <div
                    key={`${r},${c}`}
                    className={styles.deductionClue}
                    data-deduction="clue"
                    style={box([r, c])}
                />
            ))}
            <div
                className={styles.deductionTarget}
                data-deduction="target"
                style={box(diagnosis.target)}
            />
        </div>
    );
}
```

- [ ] **Step 4: Add the styles**

Append to `components/game/board.module.css`:

```css
/* The missed deduction, over a finished daily board. Above the cursors: the
   run is over, so nothing else on this board is live. */
.deductionLayer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 7;
}

.deductionClue,
.deductionTarget {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
}

.deductionClue {
    box-shadow: inset 0 0 0 var(--ms-border-width) var(--ms-intent-primary);
}

.deductionTarget {
    box-shadow: inset 0 0 0 var(--ms-border-width) var(--ms-intent-error);
    animation: deductionPulse var(--ms-duration-loop) ease-in-out infinite;
}

@keyframes deductionPulse {
    0%, 100% { box-shadow: inset 0 0 0 var(--ms-border-width) var(--ms-intent-error); }
    50% { box-shadow: inset 0 0 0 var(--ms-border-width) var(--ms-intent-error), 0 0 8px var(--ms-intent-error); }
}

/* The outline is the information; the pulse is decoration. */
@media (prefers-reduced-motion: reduce) {
    .deductionTarget {
        animation: none;
    }
}
```

- [ ] **Step 5: Mount it on the board**

In `components/game/Board.tsx`, add the import:

```tsx
import DeductionLayer from '@/components/game/DeductionLayer';
```

and mount it beside the existing overlays, replacing:

```tsx
            <CursorLayer boardRef={boardRef} />
            <KeyboardCursor boardRef={boardRef} />
```

with:

```tsx
            <CursorLayer boardRef={boardRef} />
            <KeyboardCursor boardRef={boardRef} />
            <DeductionLayer boardRef={boardRef} />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run components/game/DeductionLayer.test.tsx components/game/Cell.test.tsx`
Expected: PASS. `Cell.test.tsx` is run to confirm the hot path is untouched.

- [ ] **Step 7: Full verification**

Run: `npm run test:client && npx tsc --noEmit && npm run lint`
Expected: all pass.

Then, with `npm run dev:all` already running, run the browser suite BEFORE the
production build:

Run: `npm run test:ui`
Expected: ALL CHECKS PASSED. `components/` and `hooks/` were both touched, and the suite asserts the board is mounted exactly once — a fourth child of `.gameBoard` must not have disturbed that.

If the AVATARS section reports `CDP timeout`, re-run once: that section is unrelated to this change and the suite is documented as the flakiest thing in the pipeline.

**`npm run build` LAST, and never while the dev server the smoke suite uses is
running.** A production build overwrites `.next`, and the dev server then serves
a mixture that sizes board cells wrongly — which surfaces as four failures in
CO-OP, DESKTOP FIT and FOOTER CLEARANCE that look exactly like a layout
regression and are not one. If that happens: stop the dev server, `rm -rf
.next`, restart it, and re-run.

Run: `npm run build`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add components/game/DeductionLayer.tsx components/game/DeductionLayer.test.tsx components/game/board.module.css components/game/Board.tsx
git commit -m "Show the missed deduction on the board it was missed on

Coordinates in prose are useless on a 16x16 grid. An overlay rather than cell
props, following CursorLayer and KeyboardCursor: a board holds up to 512
memoized cells and marking three of them should not cost a prop on every one.
It outlives the dialog, which is what the daily's view-only replay is for."
```

---

## Manual check before opening a PR

The suites cannot lose a daily on demand, so confirm once by hand:

1. `npm run dev:all`, open `/daily`, start the puzzle, and click until you hit a mine.
2. The dialog names a pattern and offers **Drill it**.
3. Closing the dialog leaves the outline on the board.
4. **Drill it** lands on the matching lesson.
5. Toggle "Reduce motion" in the OS and reload: the target keeps its outline and stops pulsing.
6. Switch to the Game Boy palette on `/settings`: both outlines are still visible against the finished board.
