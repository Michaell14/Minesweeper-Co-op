# Design: Loss diagnosis — turn a daily-challenge death into the drill for it

**Status:** Design approved 2026-08-29 · **Owner:** Michael · **Created:** 2026-08-29

---

## 1. Summary

When a daily-challenge run ends on a mine, tell the player **which deduction
they missed, by name**, and hand them the drill that teaches it.

Every board on this site is verified logic-solvable before it ships
(`server/domain/solverUtils.js`, and `shared/boardConfig.js` §MAX_SAFE_DENSITY
exists to keep it that way). That guarantee has a consequence nothing in the
product currently uses: **every loss is a missed deduction, and there is always
something specific to point at.**

The site already has both halves of the answer and has never connected them.
`/drills` teaches the named patterns interactively. `lib/drillDeduction.ts`
can already find what a position proves and say why in a sentence. What is
missing is the wire between the moment a player fails and the lesson that
would have saved them.

Scope for v1 is the **daily challenge only** — see §3.

## 2. Goals / Non-goals

**Goals**

- Name the pattern that was available: `1-1`, `1-2`, `1-2-1`, `1-2-2-1`,
  falling back to `counting` / `reduction`.
- Distinguish the two ways a run ends, because they teach different things:
  the cell you opened was provably a mine, versus that cell was genuinely
  unknown while a certain move sat elsewhere.
- Show the proof **on the board**, not as coordinates in prose.
- Link to the matching lesson at `/drills/[lesson]`.
- Cost nothing during play, and nothing on the server.

**Non-goals**

- Co-op and PVP (§3).
- Any change to the socket protocol, the server, or Redis. There is none; see §5.
- Teaching a *better* move. This names a move that was certain, not the optimal one.
- Naming patterns that do not lie along a row or column (§8).

## 3. Why the daily, first

The daily is the right first home, and not only because it is the smallest:

- **One attempt.** There is no "Play again" to click past, so a diagnosis is
  the only thing left to do with the run.
- **The board is already a view-only replay.** `DailyChallenge.tsx` keeps the
  finished board mounted and says so ("this board is view-only"). There is
  already a board on screen to point at, with nothing competing for it.
- **One player.** Co-op's summary dialog opens for *everyone* in the room while
  only one person clicked the mine, so "you missed a 1-2-1" is wrong for the
  other three and the copy needs a per-viewer split. PVP's loss is not even
  final — `Reset My Board` keeps you racing — so a lesson competes with the
  clock the player is trying to beat.

Both are worth doing. Neither should gate the first version, and both are
easier once the analysis module exists and is proven.

## 4. What the player sees

Two cases, detected in this order.

**Case A — the mine you opened was provable.**

> **Uh Oh!**
> You missed a **1-2-1**.
> The 2 at row 7, column 4 needs 1 more mine than the 1 at row 7, column 2, and
> sees exactly 1 covered cell that one cannot — so that cell is a mine.
> `[ Drill the 1-2-1 pattern → ]`

**Case B — that cell was not provable, but something else was.**

> **Uh Oh!**
> Nothing proved that cell — but this did.
> The blank cell at row 3, column 9 touches no mines at all, so every covered
> cell around it is safe.
> `[ Drill counting → ]`

Case B is expected to be the **common** one: players guess when stuck far more
often than they misread a pattern they can see. Its copy therefore matters more
than Case A's, and it must not read as an accusation — the interesting fact is
that a certain move existed, not that the player gambled.

In both cases the clue cells are outlined on the replay board and the target
cell is marked. **The highlight outlives the dialog**: closing the summary
leaves it on the board, which is the whole reason this mode was chosen.

When nothing at all is provable, there is no diagnosis and the dialog renders
exactly what it renders today (§8).

## 5. Why this needs no server, and no protocol change

Three facts line up, and all three were verified against the running app:

1. **The client is already given the whole truth at game over.**
   `server/game/daily.js` emits `DAILY_BOARD_UPDATE` with
   `projectBoard(board, { revealMines: true })`. `projectCell` keeps `isOpen`
   truthful rather than opening everything, so the payload carries every mine
   and every number *and* the exact open/flagged set.

2. **The store still holds the pre-loss position when that payload lands.**
   The handler at `hooks/useGameEvents.ts:471` is
   `({ board }) => setBoard(board)`, and the server emits it *before*
   `DAILY_GAME_OVER`. Inside that handler, `getState().board` is the position
   before the fatal move and the argument is the revealed truth.

   This is exact even for a chord that opened safe cells before detonating:
   on a losing move `openCell` and `chordCell` both return straight into
   `finishAttempt` **without** emitting `DAILY_UPDATE_CELLS`, so the cells the
   fatal move opened are never sent separately. The client never sees them as
   an increment, and the position it holds is genuinely pre-move.

3. **A loss is self-identifying.** On a win, `finishAttempt` sets
   `isFlagged` on the remaining mines and never opens them. So **an open mine
   can only mean a detonation** — no dependence on event ordering, and no need
   to wait for `DAILY_GAME_OVER` to know what happened.

The consequence is that the entire feature is client-side presentation. The
game server, the socket contract (`shared/events.js`, `shared/socketPayloads.ts`)
and Redis are untouched. A diagnosis cannot slow, break or alter a run.

## 6. What already exists

`lib/drillDeduction.ts` is not drill-specific. It operates on the layout string
format — `.` zero, `1`-`8` opened, `#` covered safe, `*` covered mine — and
works on a board of any size.

| Function | What it gives us |
|---|---|
| `deduce(layout, rules)` | every provable mine and safe cell |
| `explain(layout, r, c)` | **why**, as a finished player-facing sentence |
| `nextHint(layout, done)` | the next available deduction anywhere — this *is* Case B |
| `LESSON_RULES` | per-lesson `pattern` strings (`'11'`, `'12'`, `'121'`, `'1221'`) and `firstSubset` |

Note that `lines()` — which reads rows and columns forwards and backwards, so
that a 1-2 met from the other end is still a 1-2 — is **module-private and
whole-board**, and is not reused here. The classifier reads a short run around
the clue cells instead (§7.2) but must handle reflection the same way.

It also **ignores player flags**, deriving everything from opened numbers. That
is exactly right here: a wrong flag must not make the diagnosis lie.

So Case A is `explain()` returning non-null and Case B is `nextHint()`, both
with their prose already written. The new work is the adapter, the naming, the
UI and one state field.

## 7. Components

### 7.1 `lib/lossDiagnosis.ts` (new, pure)

```ts
positionToLayout(preLoss: Cell[][], revealed: Cell[][]): string[]
// Cell is state/types.ts's { isMine, isOpen, isFlagged, nearbyMines }
```

Open cell → its digit, or `.` at zero. Covered → `*` or `#` according to the
revealed board's `isMine`. Flags are deliberately dropped (§6).

```ts
interface LossDiagnosis {
    kind: 'provable-mine' | 'guess';
    lesson: LessonId;      // where "Drill it →" goes
    text: string;          // from explain() / nextHint()
    clues: Coord[];        // the opened numbers that prove it — outlined
    target: Coord;         // the mine you hit, or the safe cell you missed
    verdict: 'mine' | 'safe';
}

diagnoseLoss(preLoss: Cell[][], revealed: Cell[][]): LossDiagnosis | null
// Cell is state/types.ts's { isMine, isOpen, isFlagged, nearbyMines }
```

Finds the detonated mine (open **and** `isMine`), calls `explain()` on it, and
falls back to `nextHint(layout, [])`. Returns `null` when nothing is provable.

### 7.2 Naming the pattern

The one genuinely new piece of reasoning.

Classifying purely from the deduction's structure was considered and rejected:
a 1-2-1 *is* two overlapping 1-2 subset steps, so structurally every 1-2-1
would report as a 1-2 and the marquee case would never fire.

Instead: take rule and verdict from the deduction, then read the short run of
**open digits along the line through its clue cells** and match longest-first,
`1221` → `121` → `12` / `11`, reusing `LESSON_RULES`' own pattern strings and
`firstSubset` to separate 1-1 (equal counts, proves safe) from 1-2 (differing
counts, proves a mine). Anything unmatched falls back to the deduction's rule:
`counting` or `reduction`.

Matching is localised to the clue cells on purpose. `lines()` scans whole rows
and columns, which is correct for a 3x3 drill and useless on a 16x16 board,
where `121` appears somewhere almost every game and would name a pattern that
had nothing to do with the deduction that fired.

**Required change to an existing type.** `Explanation` must carry the
coordinates of the clue cells, which today exist only inside its prose. This is
additive: `counting` supplies `con.at`, `subset` supplies `a.at` and `b.at`,
both at the `prove(...)` call sites in `run()`. The two consumers
(`components/drills/DrillRunner.tsx`, `lib/drills.test.ts`) read only `.text`
and `.at` and are unaffected.

### 7.3 State

`dailyDiagnosis: LossDiagnosis | null` in `state/dailySlice.ts`, with a setter,
in `initialDailyState`, and therefore cleared by `resetDailyState`.

Set from the `DAILY_BOARD_UPDATE` handler when the incoming board contains an
open mine (§5, fact 3), computed from `getState().board` and the payload **before**
`setBoard` replaces it.

### 7.4 UI

**Dialog.** `components/dialogs/DailyDialogs.tsx`, the `DIALOGS.dailyGameOver`
loss branch: the headline sentence, the explanation, and a `ButtonLink` to
`/drills/[lesson]`. Renders nothing extra when the diagnosis is `null`.

**Board.** A new `components/game/DeductionLayer.tsx`, mounted inside `Board`
beside `CursorLayer` and `KeyboardCursor` — absolutely positioned over
`.gameBoard`, positioned from measured cell geometry, the established pattern
for board overlays.

This deliberately does **not** touch `Cell.tsx`. A board holds up to 512
memoized cells in the hot path, and `Cell.tsx` imports directly rather than
through the design-system barrel precisely to stay cheap; threading highlight
props through every cell to mark three of them is the wrong trade. The layer
subscribes to one nullable store field and returns `null` when there is no
diagnosis, so co-op and PVP pay a single selector and nothing else.

Styling goes in `board.module.css` with the other overlays, reading
`--ms-*` tokens, and any motion reads a `--ms-duration-*` token so
`prefers-reduced-motion` zeroes it (CLAUDE.md).

## 8. Failure modes and honesty

- **Nothing is provable.** `diagnoseLoss` returns `null` and the dialog is
  unchanged. This should be unreachable on a no-guess board — more open cells
  never reduce what is deducible, and the board was verified solvable by the
  same two rules `deduce` implements — but it must degrade silently rather than
  claim something false.
- **A pattern not along a row or column.** Falls back to `counting` or
  `reduction`, both real lessons. The named lessons all assume a shape "along a
  wall", so this is a limit the teaching material already has.
- **Two implementations of the same rules.** `deduce` (client, TypeScript) and
  `solveWithStats` (server, CommonJS) implement counting and subset reduction
  separately. They already do, today; this change does not add the duplication
  and must not attempt to remove it. `solveWithStats` decides which boards
  generate at all and which layout the daily picks, and its rule *order* feeds
  `rule1Count`/`rule2Count`. Refactoring it to share code would change the
  boards that ship.
- **Cost.** `deduce` is O(constraints²) per round. It runs **once**, at game
  over, on a board that is already finished — never during play.

## 9. Testing

- **Adapter** (Vitest, Node): round-trip a known position to layout and back
  through `deduce`.
- **Classifier** (Vitest, Node): hand-built layouts, one per shape, plus the
  cases that must *not* match — a shape elsewhere in the same row, and a
  two-digit run whose verdict contradicts it.

  The authored drills were considered as free fixtures — every drill carries
  the lesson it teaches — and **cannot be used that way**. `run()` applies its
  counting block before its subset block on every iteration, so on any drill
  whose board also permits a counting step, that is the deduction that fires
  first; a 1-2-1 drill would report `counting` and the assertion would encode
  a false invariant. `in-the-wild` compounds it: it is a collection of boards,
  not a shape, so no classification can ever equal that label.
- **Both cases end to end** (Vitest, Node): a hand-built position where the
  detonated mine is provable → Case A; one where it is not but a safe move
  exists → Case B.
- **Dialog** (Vitest, jsdom): `getByRole('link', { name })` resolves to the
  right lesson, and the sentence renders. Per CLAUDE.md this is the class of
  thing that breaks silently.
- **Not** a smoke test. The suite cannot lose the daily on demand, and jsdom
  has no layout engine, so the overlay's geometry is checked the way
  `CursorLayer`'s is — not at all in unit tests, by eye during implementation.

## 10. Collision surface

Small, but not empty:

- `lib/drillDeduction.ts` — `Explanation` gains a field. Shared with `/drills`.
- `state/dailySlice.ts`, `hooks/useGameEvents.ts` — one field, one handler edit.
- `components/game/Board.tsx`, `board.module.css` — one mounted overlay, one
  block of styles. `board.module.css` is also read by `/ds`.
- Nothing under `server/`, `shared/`, `app/drills/` or `components/drills/`
  beyond the `Explanation` field.

## 11. Later

Once the module exists and is proven on the daily:

- **Co-op**, with per-viewer copy: "Mike missed a 1-2-1" for everyone else.
- **PVP**, probably suppressed until the race is actually over rather than
  shown at the moment you hit a mine and can still reset.
- **A weakness profile** on `/profile`: the pattern a signed-in player dies to
  most often, which is a genuinely new reason to have an account.
