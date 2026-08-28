# Design: Drills — an interactive pattern trainer

**Status:** Design approved 2026-08-27, v1 implemented (Phases 1-4) · **Owner:** Michael · **Created:** 2026-08-27

**This spec is written to be executed in a SEPARATE session, in parallel with
the board-pings work** (`SOCIAL_PRD.md` Phase 2). §7 lists the collision
surface; read it before touching anything outside `app/drills/`,
`components/drills/` and `lib/drill*`.

---

## 1. Summary

A new indexable route, `/drills`, holding short single-screen tactical puzzles.
Each drill is a small complete board, already partly opened, with one guarantee:
**everything the drill asks for is deducible**. The player flags every cell they
can prove is a mine and opens every cell they can prove is safe. A wrong move
marks the cell and costs nothing else — there is no fail state and no timer.
Solving a drill reveals the one-sentence reason it worked.

The drills are grouped into six lessons that teach the patterns by name:
counting, 1-1, 1-2, 1-2-1, 1-2-2-1, and subset reduction — the general rule the
other five are special cases of.

**Why this site, specifically.** The game already promises no-guess boards and
markets that on `/no-guess-minesweeper`; drills teach exactly the deduction
those boards guarantee is always available. `/how-to-play` is prose about the
rules and chording, and this is its interactive counterpart. It is also the
first thing on the site a stranger can do that is neither multiplayer nor
once-a-day.

**Why it is safe to build in parallel.** It has no socket surface, no server
code, no Redis, no Postgres and no new shared module. See §7.

## 2. Goals / Non-goals

**Goals**

- Teach the five named patterns interactively, in under a minute each.
- Guarantee correctness mechanically: an authored drill that teaches a wrong
  lesson must fail CI, not ship.
- Work fully for guests, with no account and no network round-trip.
- Feel like the same product: same bevelled cells, same sprites, same tokens,
  same sound and input settings.

**Non-goals (v1)**

- Account sync of drill progress. localStorage only — see §6 Deferred.
- Any achievement for drills. That touches `shared/achievements.js`, the server
  evaluator and `statsRepo`, all of which are outside this branch's blast
  radius on purpose.
- Procedurally generated drills. The value is in *authored* explanations; a
  generator with no prose attached teaches nothing.
- Timers, scores, leaderboards, or a fail state. Drills are practice.
- Any change to the real game board.

## 3. Decisions

| Question | Decision | Why |
|---|---|---|
| Where the cells come from | **A drill-local `DrillCell`, not `components/game/Cell.tsx`** | `Cell` subscribes to `playerHovers`, `gameOver`, `mode`, `pvpStarted`, `pvpWinner` — none of which exist here — and it is the file board pings edits. Drills import `board.module.css` and `<Sprite>` read-only instead, so the bevel and the art stay shared without editing a contended file. |
| Fragment shape | **Every drill is a COMPLETE small board** | A windowed fragment lets an opened number count mines outside the window, which makes validation unsound and the puzzle unfair. A complete board makes edge cases (the 1-1 wall rule) use the real edge, which is what those patterns are about anyway. No padding character is needed. |
| Ground truth | **The layout carries the mines; the solution is declared separately and cross-checked** | Two independent statements of the same fact, with a test that they agree. A single derived source could not catch an authoring mistake. |
| What the solution must contain | **Exactly the full deducible set — not a subset** | If a drill asks for less than is provable, a player who deduces more gets marked wrong. The checker enforces equality in both directions. |
| Progress storage | **localStorage, versioned blob, sanitised on read** | Same discipline as `lib/settings.ts` and `lib/bestTimes.ts`. Guests are the majority and must keep progress. |
| Whether a drill teaches its own lesson | **Gated mechanically in both directions, per lesson (§4.3.1)** | Solvable-at-all is the wrong question: `deduce` runs both rules, so it passes a `counting` drill needing subset reduction *and* a `one-two-one` drill plain counting already cracks. Two bounds, one table. |
| Solver reuse | **Reimplement the two rules in `lib/`; do NOT reach for `server/domain/solverUtils.js`** | Server CJS, and `tests/layering.test.js` forbids it. They also answer different questions: the server's asks "is this whole board solvable", the drill one asks "is this specific cell provable". |
| What a correctly opened cell shows | **Its adjacent-mine count, derived from the layout's `*` positions. No cascade — a zero opens as a blank and opens nothing else.** | A cascade would open cells the player never proved, so the board would stop matching `solution` and solved-detection would desync. It would also hand over the rest of the puzzle: the drill is one deduction, not a game. |
| Input | **Obeys `swapMouseButtons` and `mobileDefaultFlag`, reads them, writes nothing** | Muscle memory has to transfer, or the drill teaches the wrong reflex. |
| Sound | **Reuse `playSound` from `lib/sound.ts`** | Already gated on `settings.sound` and background tabs. Free consistency. |
| Indexing | **Indexable, in the sitemap** | Unlike `/ds` and `/profile`. The pattern names are the searched terms. |

## 4. Architecture

Client-only. Nothing runs on the server; nothing crosses a socket.

```
app/drills/page.tsx              lesson index, progress per lesson
app/drills/[lesson]/page.tsx     one lesson: prose intro, drills in sequence
        │
        ├── components/drills/DrillRunner.tsx     one drill's state machine
        │        ├── components/drills/DrillBoard.tsx
        │        │        └── components/drills/DrillCell.tsx
        │        │                 ├── board.module.css   (read-only import)
        │        │                 └── <Sprite>           (from @/components/ds)
        │        └── lib/drillProgress.ts          localStorage
        │
        └── lib/drills.ts        the catalog (pure data + lookups)
                 └── lib/drillDeduction.ts   the checker (pure, test-facing)
```

### 4.1 File manifest

New:

```
lib/drills.ts
lib/drills.test.ts
lib/drillDeduction.ts
lib/drillDeduction.test.ts
lib/drillProgress.ts
lib/drillProgress.test.ts
components/drills/DrillCell.tsx
components/drills/DrillCell.test.tsx
components/drills/DrillBoard.tsx
components/drills/DrillBoard.test.tsx
components/drills/DrillRunner.tsx
components/drills/DrillRunner.test.tsx
components/drills/LessonDrills.tsx        (sequences one lesson; the routes are server components)
components/drills/LessonDrills.test.tsx
components/drills/LessonCard.tsx
components/drills/LessonCard.test.tsx
components/drills/drillLabel.ts          (aria-label builder; mirrors game/cellLabel.ts)
components/drills/drillLabel.test.ts
components/drills/drills.module.css      (layout, plus the `wrong` mark)
app/drills/page.tsx
app/drills/[lesson]/page.tsx
```

Edited — one line each, and none of them is a file board pings touches:

```
components/Footer.tsx        a link beside the existing three
app/sitemap.ts               a /drills entry (and one per lesson)
app/how-to-play/page.tsx     a link into /drills from the chording answer
```

### 4.2 Data model

```ts
export type Coord = readonly [row: number, col: number];

export type LessonId =
    | 'counting' | 'one-one' | 'one-two'
    | 'one-two-one' | 'one-two-two-one' | 'reduction';

export interface Drill {
    id: string;                 // 'one-two-one-a'
    lesson: LessonId;
    prompt: string;             // "Flag every mine you can prove."
    layout: readonly string[];  // row-major, one char per cell
    solution: {
        flag: readonly Coord[];
        open: readonly Coord[];
    };
    explanation: string;        // shown after a correct solve
}
```

**Layout charset** — four characters, no padding character:

| Char | Meaning | Rendered as |
|---|---|---|
| `.` | opened, zero adjacent mines | opened blank cell |
| `1`–`8` | opened, that many adjacent mines | opened number |
| `#` | covered, safe | covered cell; once opened, its derived adjacent-mine count |
| `*` | covered, mine | covered cell (identical to `#`) |

`*` is ground truth only. It renders exactly like `#`, so the layout string is
both the puzzle and its answer key, and the two can be checked against each
other.

### 4.3 The checker — `lib/drillDeduction.ts`

The load-bearing piece. Without it, one authoring typo teaches a wrong pattern
to every player, forever, with nothing failing. This is the same bet as
`app/tokens.test.ts`: parse the data and fail CI on what otherwise fails
silently.

Two exported functions:

```ts
export type RuleId = 'counting' | 'subset';

/** Every mine/safe cell provable from the OPENED cells using ONLY `rules`. */
export function deduce(
    layout: readonly string[],
    rules?: readonly RuleId[],      // default: both
): { mines: Coord[]; safe: Coord[] };

/** Whether a drill's numbers, mines, solution and LESSON all agree. */
export function validateDrill(drill: Drill): string[];   // [] means valid
```

`deduce` runs to a fixpoint over two rules:

1. **Counting.** For an opened cell showing `n`, let `F` be its neighbours
   already proven mines and `U` its neighbours still unknown.
   `n - |F| === 0` proves every cell in `U` safe; `n - |F| === |U|` proves
   every cell in `U` a mine.
2. **Subset reduction.** For two opened cells `a`, `b` with unknown neighbour
   sets `Ua ⊂ Ub` and remaining counts `ra`, `rb`:
   `rb - ra === |Ub \ Ua|` proves every cell in `Ub \ Ua` a mine;
   `rb - ra === 0` proves every one of them safe.

`validateDrill` returns a problem string for each of:

- a layout whose rows are ragged, or that contains an unknown character;
- an opened digit that does not equal its actual adjacent `*` count;
- a declared `flag` cell that is not `*`, or a declared `open` cell that is;
- **inequality in either direction** between `deduce(layout)` and the declared
  solution. Asking for less than is provable is a bug, not a mercy: a player
  who deduces more would be marked wrong;
- a mine that is not deducible. Ground truth calls a lucky flag on it correct,
  but it is absent from the solution, so the marked set can never equal the
  solution and the drill becomes unfinishable. This is §1's promise —
  *everything the drill asks for is deducible* — made mechanical;
- **a covered cell nothing can reach** — one whose neighbours are all covered is
  never flagged and never opened, so the board "solves" with it still sitting
  there looking unfinished;
- any part of the lesson gate below.

`lib/drills.test.ts` runs `validateDrill` over the whole catalog. Node
environment — no DOM.

### 4.3.1 The lesson gate

`deduce` runs both rules, so solvability alone does not prove a drill teaches
what its lesson claims. Two failures slip through it, in opposite directions:

- a `counting` drill that is actually only solvable by subset reduction — the
  lesson has not taught that rule yet;
- a `one-two-one` drill that is solvable by plain counting — it never exercises
  the pattern it is named after, and a player passes it without learning
  anything.

So each lesson declares a **bound in each direction**, and `validateDrill`
checks both by re-running `deduce` with a restricted rule set:

```ts
export interface LessonRules {
    allow: readonly RuleId[];    // deduce restricted to these must still solve it
    require: readonly RuleId[];  // dropping any one of these must leave it UNSOLVED
}

export const LESSON_RULES: Record<LessonId, LessonRules> = {
    'counting':        { allow: ['counting'],            require: ['counting'] },
    'one-one':         { allow: ['counting', 'subset'],  require: ['subset'] },
    'one-two':         { allow: ['counting', 'subset'],  require: ['subset'] },
    'one-two-one':     { allow: ['counting', 'subset'],  require: ['subset'] },
    'one-two-two-one': { allow: ['counting', 'subset'],  require: ['subset'] },
    'reduction':       { allow: ['counting', 'subset'],  require: ['subset'] },
};
```

**Upper bound** (`allow`): `deduce(layout, allow)` must equal the declared
solution. For `counting` this is the real constraint — it fails a drill that
needs subset reduction. For the rest `allow` is both rules, so it restates the
equality check above and costs nothing.

**Lower bound** (`require`): for each rule `r` in `require`,
`deduce(layout, allow \ [r])` must fall **short** of the declared solution. For
the five pattern lessons this is the real constraint — it fails a drill that
plain counting already cracks. For `counting` it holds trivially (with no rules
left, nothing is provable), which is correct rather than merely convenient.

The two bounds are why `require` is a list rather than a single rule: a third
rule added later is gated in both directions by the same table, with no new
checking code.

**Which named pattern.** The bounds above prove a drill needs subset reduction;
they cannot tell 1-1 from 1-2-1, since both do. Two further fields in the same
table narrow it:

- `pattern` — digits that must appear in some row **or column** (`11`, `12`,
  `121`, `1221`), so a vertical board passes on its own terms.
- `firstSubset` — what the FIRST subset step must prove. This is the one
  structural difference that does not depend on reading digits: the 1-1 rule is
  the equal-counts case and proves cells **safe**, while the 1-2 family differs
  by the count and proves **mines**.

Both are needed, and both are **necessary rather than sufficient**: `1211`
contains `11` exactly as `1121` contains `12`, so shape alone cannot separate
`one-one` from `one-two` — direction does. Nothing here separates `one-two` from
`one-two-one` from `one-two-two-one`; all three open on a mine-proving step and
`121` contains `12`. That last distinction remains an authoring judgement, and
the spec should not be read as claiming otherwise.

`reduction` constrains neither field. It is the general rule, so any shape and
either direction is the lesson.

This gate is not theoretical: it failed two drills already in the catalog
(`one-two-two-one-c` and `-d`), both of which opened with a 1-1 step. Their own
explanation text said so. No wall longer than the canonical `1221` survives it —
a longer wall always has an equal-count pair further left that fires first.

### 4.4 Worked examples

Two drills authored and verified by hand, to pin the format down. The remaining
~22 are authored during implementation; the checker is what makes that safe.

**`counting-a`** — a `1` with exactly one covered neighbour.

```
layout:  ['*1.',
          '11.',
          '...']
solution: { flag: [[0, 0]], open: [] }
explanation: "The 1 touches exactly one covered cell, so that cell is the mine it is counting."
```

Verified: `(0,1)` sees one mine among `{(0,0),(0,2),(1,0),(1,1),(1,2)}` ✓;
`(1,0)` and `(1,1)` likewise ✓; every `.` sees none ✓. `deduce` proves `(0,0)`
a mine and nothing else, matching the solution exactly.

**`one-two-one-a`** — the pattern, on a two-row board so both ends are real edges.

```
layout:  ['121',
          '*#*']
solution: { flag: [[1, 0], [1, 2]], open: [[1, 1]] }
explanation: "The two 1s each want one mine and the 2 wants both. Only mine-safe-mine satisfies all three."
```

Verified: with `a,b,c` the covered row, `a+b=1`, `a+b+c=2`, `b+c=1` forces
`a=1, b=0, c=1` — the unique solution, so all three cells are provable and the
declared solution is the complete deducible set ✓.

### 4.5 Interaction

- Left click opens, right click flags, both swapped by `settings.swapMouseButtons`.
  On touch, tap follows `settings.mobileDefaultFlag` with long-press for the other.
- Opening a proven-safe cell reveals that cell ALONE, showing the number of `*`
  cells around it (blank at zero). Never a cascade: see §3. `adjacentMines` in
  `lib/drillDeduction.ts` is the one place that count is derived, and
  `validateDrill` checks the authored digits against the same function.
- A move that contradicts the ground truth marks that cell (a `wrong` modifier
  reading `--ms-intent-error`) and increments a per-attempt mistake count. The
  drill does not end. A second click clears the mark and lets the player retry.
- A wrong move also **says why**, from `explain()` in `lib/drillDeduction.ts`.
  The reason is derived from the RULES, never from the layout's mines: a drill
  that only said "that was a mine" would teach nothing, and an explanation the
  player cannot reproduce on the board is not an explanation. The message names
  the opened numbers that prove the cell.
- A **Hint** button points at the next provable cell and names the rule that
  proves it (`nextHint()`, which walks DEDUCTION order rather than board order,
  so the hint is the step the rules actually reach next). It outlines the cell;
  it never plays the move, since solving it for the player destroys the thing
  being taught. Using one costs `perfect`, exactly as a mistake does.
- A drill is solved when the marked set equals `solution` — checked against the
  declared solution, never against ground truth directly, so the two stay
  independent all the way to the UI.
- On solve: the explanation appears, plus a `<Badge>`. **No confetti** — this is
  a two-line success, not a won game. Any transition reads a `--ms-duration-*`
  token.
- Cells are `<button>`s inside a `role="grid"`, named by `drillLabel.ts` in the
  shape `cellLabel.ts` already uses, so `getByRole('gridcell', { name })` works
  in tests. Tab reaches every cell; Enter opens, `F` flags. The arrow-key cursor
  from `KeyboardCursor` is out of scope for v1.

### 4.6 Progress — `lib/drillProgress.ts`

```ts
interface DrillProgress {
    version: 1;
    completed: string[];   // drill ids solved at least once
    perfect: string[];      // solved with zero mistakes
}
```

`perfect` means solved cold: no mistakes AND no hints. `recordSolved` takes an
`Attempt` (`{ mistakes, hints }`) rather than a bare count, so the two reasons a
solve is not perfect stay distinguishable at the call site.

localStorage key `ms-drills`. Read through a sanitiser that drops unknown keys
and defaults missing ones, exactly as `lib/settings.ts` does — a hand-edited or
stale blob must degrade to "no progress", never throw on a page load.

Not synced to the account in v1. When it is (see §6 Deferred), it mirrors `BestsSync`:
merge rather than server-wins, since a guest can accumulate progress before
signing in.

## 5. Content — v1 lessons

Six lessons, ~24 drills. Each lesson opens with two or three sentences of prose
and ends in a completion state.

| Lesson | Drills | Teaches |
|---|---|---|
| `counting` | 3 | A number equal to its covered neighbours means all mines; a satisfied number means all its covered neighbours are safe. |
| `one-one` | 4 | The 1-1 rule along a wall. |
| `one-two` | 4 | 1-2 along a wall: the far cell past the 2 is a mine. |
| `one-two-one` | 4 | mine-safe-mine. |
| `one-two-two-one` | 4 | safe-mine-mine-safe. |
| `reduction` | 5 | Subset reduction — the rule all five above are instances of. |

Ordering is deliberate: the named patterns first because they are what players
search for, then the general rule that retires them.

## 6. Phases

### Phase 1 — the checker (do this first)

- [x] `lib/drillDeduction.ts`: `deduce` (counting + subset, to fixpoint, rule-restrictable)
      plus `LESSON_RULES` and `validateDrill`.
- [x] `lib/drillDeduction.test.ts`: table-driven. Cover a satisfied number, an
      exhausted number, a subset that proves mines, a subset that proves safes,
      a board where nothing is provable, and a ragged/invalid layout.
- [x] Lesson-gate tests, one per direction: a `counting` drill that needs subset
      reduction is rejected, and a `one-two-one` drill that plain counting
      already solves is rejected too.
- [x] `lib/drills.ts` with the two worked drills from §4.4 only, and
      `lib/drills.test.ts` running `validateDrill` over the catalog.

Building the checker before the content is the whole point: every drill authored
afterwards is verified as it is written.

### Phase 2 — the board

- [x] `components/drills/DrillCell.tsx` + `DrillBoard.tsx`, importing
      `board.module.css` and `<Sprite>` read-only. No store subscriptions.
- [x] `drillLabel.ts`, mirroring `components/game/cellLabel.ts`.
- [x] Input honouring `swapMouseButtons` / `mobileDefaultFlag`; `playSound` on
      reveal and flag.

### Phase 3 — the runner and the routes

- [x] `DrillRunner.tsx`: marks, mistake count, solved detection, explanation.
- [x] `lib/drillProgress.ts` + sanitiser + tests.
- [x] `app/drills/page.tsx` (index, `LessonCard` with progress) and
      `app/drills/[lesson]/page.tsx`.
- [x] Metadata per route, own canonical, in the shape `app/how-to-play/page.tsx`
      already uses.
- [x] `DrillRunner.test.tsx` with `// @vitest-environment jsdom`: a correct move
      advances, a wrong move marks without advancing, the explanation appears on
      solve, cells resolve by accessible name.

### Phase 4 — content and wiring

- [x] The remaining ~22 drills, each landing green under `validateDrill`.
- [x] Lesson prose.
- [x] `Footer.tsx` link, `app/sitemap.ts` entries, `/how-to-play` cross-link.
- [x] `npm run lint`, `tsc --noEmit`, `npm run test:client`, `npm run build`.

### Deferred (explicitly not v1)

Account sync of progress · a drills achievement · procedural drills · an
arrow-key cursor · a "practice this pattern" link from a lost game.

## 7. Parallel-work contract

The board-pings branch owns these files. **Do not edit any of them:**

```
shared/events.js
shared/socketPayloads.ts
server/server.js
server/domain/rateLimit.js
hooks/useGameEvents.ts
components/game/Cell.tsx
components/game/Board.tsx
components/game/CursorLayer.tsx
components/game/useCellMetrics.ts
```

`components/game/board.module.css` is imported read-only by `DrillCell` and must
not be edited here — pings may append a ping-ring class to it.

The three shared files this branch does edit (`Footer.tsx`, `app/sitemap.ts`,
`app/how-to-play/page.tsx`) are all one-line additions and none is on the pings
list.

**One trap.** `scripts/ui-smoke/run.js` asserts there is exactly one
`role="grid"` in the DOM — scoped to the root route, so a drill board on
`/drills` is fine. Putting a drill teaser on the landing page would trip
CLAUDE.md trap #3 and fail the smoke suite. Don't.

## 8. Testing

| What | Where | Environment |
|---|---|---|
| Deduction rules | `lib/drillDeduction.test.ts` | node |
| Catalog integrity (every drill) | `lib/drills.test.ts` | node |
| Progress sanitiser | `lib/drillProgress.test.ts` | node |
| Cell labels | `components/drills/drillLabel.test.ts` | node |
| Cell rendering, mouse/touch/keyboard input | `components/drills/DrillCell.test.tsx` | jsdom |
| Board shape and derived counts | `components/drills/DrillBoard.test.tsx` | jsdom |
| Runner behaviour and accessible names | `components/drills/DrillRunner.test.tsx` | jsdom |
| Lesson sequencing | `components/drills/LessonDrills.test.tsx` | jsdom |
| Lesson card progress | `components/drills/LessonCard.test.tsx` | jsdom |

All under `npm run test:client`. No server tests — there is no server change.
The ui-smoke suite is not extended in v1; jsdom covers what fails silently here
(the accessible name, the wrong-move path, the explanation), and nothing in
drills depends on layout.

## 9. Risks

| Risk | Mitigation |
|---|---|
| An authored drill teaches a wrong pattern | `validateDrill` over the whole catalog in CI, checking numbers, ground truth and solution completeness. This is the reason Phase 1 comes first. |
| A drill is solvable only by a rule the lesson has not taught | The lesson gate's **upper** bound (§4.3.1): `deduce` re-run with only that lesson's `allow` rules must still reach the full solution. Solvability by `deduce` at large is not enough — it always runs both rules. |
| A drill is unfinishable because a lucky flag lands on a mine the solution never asked for | `validateDrill` requires every `*` to be provable, not just the declared ones. Solved compares marks to the DECLARED solution while moves are judged against ground truth, and this is what keeps the two from ever disagreeing. |
| A drill is filed under a pattern it does not actually teach | `pattern` and `firstSubset` in `LESSON_RULES` (§4.3.1). Necessary, not sufficient — it cannot separate the three members of the 1-2 family. |
| A drill leaves a covered cell nobody can resolve | `validateDrill` requires every covered cell to be provable, not just every mine. |
| A drill named after a pattern never exercises it | The lesson gate's **lower** bound (§4.3.1): dropping a `require`d rule must leave the drill unsolved. A 1-2-1 drill that plain counting cracks fails CI. |
| `DrillCell` drifts from `Cell` and stops looking like the game | Both read `board.module.css`; only behaviour is reimplemented, never the treatment. |
| Duplicating cell logic ages badly | Accepted knowingly. `Cell` is coupled to five store slices that do not exist here, and sharing it would mean editing the file board pings owns. Revisit only if a third board appears. |
| Content is the long pole | Phases 1–3 ship a working trainer with two drills; content lands incrementally after and each addition is independently verified. |
