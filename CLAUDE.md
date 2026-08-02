# CLAUDE.md

Guidance for AI agents working in this repo. Read `ARCHITECTURE.md` for the full system map, socket protocol, and Redis schema.

## What this is

Real-time multiplayer Minesweeper — co-op on one shared board, a 1v1 race, and
a single-player daily challenge. Two deployables in one repo:

- **Frontend** — Next.js 14 App Router at the repo root (`app/`, `components/`, `lib/`). TypeScript, Zustand, Tailwind, and an in-repo design system in `components/ds/`. No UI component library. Vercel.
- **Backend** — `server/`, a **separate npm package** with its own `package.json`, lockfile, and `node_modules`. CommonJS, Express + Socket.io, state in Redis. Heroku.

They share code only through `shared/` (see below). The socket protocol is the
contract: event names live in `shared/events.js`, payload shapes in
`shared/socketPayloads.ts`. The types bind the **client only** — the server is
CommonJS and can't import them, so it validates inbound payloads with
`server/validation.js` and its emits are kept in step by hand.

**`main` is the trunk** — the GitHub default and the only branch anything deploys
from. Heroku auto-deploys the whole repo from `main` and starts it with the root
`/Procfile`; Vercel builds the frontend from the same branch. See
ARCHITECTURE.md §6.

## Commands

```bash
npm run dev:all            # Redis (auto-start) + backend :3001 + frontend :3000
npm run dev                # frontend only
npm run start-server       # backend only
npm test                   # server Jest suite (proxies to `npm --prefix server test`)
npm run test:client        # client unit tests (Vitest) — pure logic + component rendering
npm run test:ui            # browser smoke test; needs dev:all running
npm run verify:deploy      # plays a real game against the DEPLOYED backend
npm run lint
npm run build
```

Backend deps install separately: `npm --prefix server install`.

## Conventions

- 4-space indent (except `app/layout.tsx`, which is 2). No Prettier configured.
- Server is **CommonJS** (`require`/`module.exports`); client is ESM + TypeScript. Do not mix.
- Client imports use the `@/` alias (`@/components/...`, `@/lib/...`, `@/app/store`).
- **Anything that animates reads a `--ms-duration-*` token.** One media query in `app/tokens.css` zeroes them all under `prefers-reduced-motion`, so a hardcoded duration is motion that ignores the user's preference. Motion CSS can't reach — a canvas burst, say — goes through `prefersReducedMotion()` in `lib/motion.ts`.
- **Never write a raw colour, font size or border width in a component.** Every one is a token in `app/tokens.css`, and a theme overrides only the `--ms-palette-*` layer — if something needs a semantic token to change, fix it upstream rather than in the theme. Inside `components/ds/`, read them as CSS custom properties (`var(--ms-intent-primary)`); everywhere else use the Tailwind semantic classes wired to them (`bg-surface-panel`, `text-pixel-sm`). A hex, a `bg-blue-500` or a `text-xs` is a bug — it survives a theme change while everything around it moves.
- **Build UI from `components/ds/`, not from raw elements.** `Button`, `Input`, `Panel`, `Dialog`, `Badge`, `Table`, `Field`, `RadioCard`, `Switch`. Import from `@/components/ds`, never from a file inside it — except in hot paths like `Cell.tsx`, which imports the one thing it needs directly to avoid pulling the whole barrel.
- Redis values are all strings — booleans are stored as `'true'`/`'false'` and compared as strings, and numbers need `parseInt(..., 10)`.
- **Go through `server/data/roomRepo` / `playerRepo`.** Don't import the Redis client or build a key string outside `server/data`. A mistyped key is a silent no-op, not an error.
- Socket handlers validate payloads with helpers from `server/validation.js`, then call `isValid(room)` before touching state. Follow that order for new handlers, and add new rules to `validation.js` rather than inline.
- **Anything that rewrites a board must hold an action lock**, and re-read under it — anything read before the lock is stale by the time the write runs. Co-op shares one board, so its lock is per room (`withActionLock`, taken by `game/index.js` and by `resetGame`). PVP players own separate board fields and are meant to race, so theirs is per player (`withPvpActionLock`, taken by `game/index.js`, `resetMyBoard` and `pvpRematch`) — **never key a PVP lock by room**, that serialises the racers against each other. New state a handler both reads and writes goes inside the lock too, and gets read there rather than passed in. The locks are **not reentrant**: a function holding one must not call anything that takes the same key, and the two PVP keys are only ever taken in index order. The daily challenge follows the same rule per attempt (`dailyRepo.withAttemptLock`), since one browser's token is shared across tabs.
- Board cells are always `{ isMine, isOpen, isFlagged, nearbyMines }`.
- **Never emit a board or cell list straight from Redis.** Run it through `projectBoard` / `projectCells` (`server/domain/board.js`) so closed cells don't leak `isMine` or `nearbyMines`. Pass `{ revealMines: true }` only for terminal states. See ARCHITECTURE.md §3.1.

## Where things live

| Task | File |
|---|---|
| Add/modify a socket event | `hooks/useGameEvents.ts` (handler table) or `hooks/useGameActions.ts` (emit), `server/server.js` |
| Co-op cell actions | `server/game/coop.js` |
| PVP cell actions | `server/game/pvp.js` |
| Deciding which mode handles an action | `server/game/index.js` — the only dispatch point |
| PVP lifecycle (start/reset/rematch) | `server/controllers/pvpController.js` |
| Which PVP board a socket owns | `server/domain/pvpPlayer.js` — `pvpIndexOf`; **never** default a missing index to 0 |
| PVP disconnect grace period | `server/utils/pvpForfeit.js` — a reload must not forfeit |
| Daily challenge (cell actions, seeded board) | `server/game/daily.js` |
| Daily lifecycle (start/submit/leaderboard) | `server/controllers/dailyController.js` |
| Rejoin-after-reload | `server/controllers/sessionController.js`; `SESSION_RESUME` in `hooks/useGameEvents.ts` |
| Win check, room creation, reset | `server/utils/gameUtils.js` (generation moved to `domain/boardGen.js`) |
| Board generation, no-guess solvability | `server/domain/boardGen.js`, `server/domain/solverUtils.js` (pure — easiest place to add tests) |
| Join/leave, scores, disconnects | `server/utils/playerUtils.js` |
| Redis schema / any data access | `server/data/keys.js` and the repos beside it (`roomRepo`, `playerRepo`, `sessionRepo`, `dailyRepo`) |
| Lock mechanics (lease, backoff, release) | `server/data/locks.js` — one implementation; each repo only picks the key |
| Client state | `state/` (one slice per concern); import from `@/app/store` |
| Design system (buttons, inputs, panels, dialogs, table, icons) | `components/ds/`; barrel at `components/ds/index.ts` |
| Colours, type scale, spacing, border width | `app/tokens.css`, surfaced to Tailwind in `tailwind.config.ts` |
| Component catalog (every primitive on one page) | `app/ds/` — `/ds` route, noindex |
| Board/controls UI | `components/game/` (Board, StatusBanner, ProgressBar, ScoreTable, FlagCounter, Timer, RoomPanel, GameSummary); `components/Grid.tsx` is layout only |
| Daily challenge UI | `components/DailyChallenge.tsx`, `components/dialogs/DailyDialogs.tsx`, `state/dailySlice.ts` |
| The run clock | `server/domain/clock.js` (server), `lib/gameClock.ts` (the one reading), `components/game/Timer.tsx` |
| Personal best times | `lib/bestTimes.ts` (localStorage, keyed by board dimensions), `hooks/useBestTime.ts` |
| Cell interaction | `components/game/Cell.tsx` |
| Room create/join UI | `components/landing/` (one file per form or dialog); `components/Landing.tsx` composes them |
| Board sizes, difficulty densities, limits, validity rule | `shared/boardConfig.js` — imported by both halves |
| Socket event names | `shared/events.js` — imported by both halves |
| Socket payload types | `shared/socketPayloads.ts` — keyed by the event VALUE (`'gameClock'`), not its constant name |
| Post-deploy check | `scripts/verify-deploy/` — `npm run verify:deploy` |
| Client test setup (jsdom, DOM cleanup) | `vitest.config.ts`, `test/setup.ts` |
| Motion / reduced motion | `--ms-duration-*` in `app/tokens.css`; `lib/motion.ts` for the JS path |
| Palette / theming | `lib/theme.ts` (list, persistence, no-flash script, cursor ramp); picker in `components/ThemePicker.tsx` |
| Dialogs | `lib/dialogs.ts` for ids and `openDialog`/`closeDialog`; `components/ds/Dialog.tsx` for the shell; markup in `components/dialogs/` (`GameDialogs`, `DailyDialogs`), `Grid.tsx`, `Landing.tsx`, `Footer.tsx` |

## Traps

Read `ARCHITECTURE.md` §8-9 before changing server code. The ones most likely to bite:

1. **The server's layers are enforced, not suggested.** `tests/layering.test.js` derives the import graph from source and fails on a cycle, on any module importing a higher layer, or on anything in `domain/` reaching outside it. Order, lowest first: `config`/`validation` → the io and Redis singletons → `domain/` (pure) → `data/` → `utils/` → `game/` → `controllers/` → `server.js`. This exists because `gameUtils` and `playerUtils` used to require each other, which made `resetGame()` throw *depending on which file node loaded first*; `tests/resetGame.test.js` still guards that one function and its require order is load-bearing.
2. **Adding a socket event touches four places**: `shared/events.js` (the name), `shared/socketPayloads.ts` (the payload), the server handler/emit, and the client table in `hooks/useGameEvents.ts`. `server/tests/events.test.js` fails if they drift. It was five until `shared/events.js` started freezing its objects — `Object.freeze` makes TypeScript infer `'boardUpdate'` instead of widening to `string`, which is what a hand-written `events.d.ts` used to buy. **Don't unfreeze them**: nothing breaks loudly, the handler table just degrades to `any`.
3. **`components/Grid.tsx` mounts the board exactly ONCE.** Two *control* clusters remain (desktop `hidden xl:flex`, mobile `xl:hidden`) because those arrangements genuinely differ, but they sit on one flex line with the single board between them. Don't move `<Board>` inside a cluster to "fix" a layout — that puts 512 cells in the DOM for a 16x16 game and makes every DOM query ambiguous. `scripts/ui-smoke/run.js` asserts the count and will fail. Where the layouts genuinely differ it is an explicit prop (`variant`), not a second copy.
4. **Socket handlers go in the `hooks/useGameEvents.ts` table**, not in a component. Registration and cleanup are derived from that table; don't call `socket.on` directly.
5. **Dialogs are native `<dialog>` elements**, opened imperatively via `openDialog(DIALOGS.x)` and closed by submitting their `form method="dialog"`, so don't convert them to conditional rendering casually. Never type a dialog id as a string literal — import it from `lib/dialogs.ts`. **Use `<DialogClose>` for any button meant to dismiss a dialog**: `<Button>` defaults to `type="button"`, and a close button that isn't `type="submit"` silently stops closing with nothing wrong in the markup.
6. **`components/ds/` primitives are shared — check every call site before changing one.** They replaced Chakra and NES.css, both now removed, so there is no upstream to fall back on. Three border treatments exist deliberately: controls are *notched* (cut corners, offset `box-shadow`, `pixel.module.css`), regions are *boxed* (square border), and board cells are *bevelled* (two inset shadows, `board.module.css`) — a board can hold 512 cells, so it takes the cheap treatment. Don't reach for `border-image` — that is what made NES.css's inputs render dashed in Chrome.
7. **PVP players race the SAME board**, generated once by `startPvpGame` with a shared opening already revealed. Don't reintroduce per-player generation on first click — that is what used to make the layouts differ.
8. **The root `/Procfile` and `heroku-postbuild` are load-bearing** — Heroku deploys the whole repo and starts it with them, and it is now the only Procfile (a second, inert one under `server/` was removed). Don't "tidy" the root ones, and see ARCHITECTURE.md §6 before touching the duplicated server deps in the root `package.json`.
9. **The daily challenge is NOT a room, on purpose.** A room is a shared mutable board with a membership list and a broadcast channel; the daily is one immutable template copied per player, with nothing to broadcast. It has its own keys, repo and events, addressed by **UTC date + an opaque browser token** rather than room code + socket id — which is also what lets an attempt survive a reconnect. Don't route it through `roomRepo`, `game/index.js` or the room `isValid` guard; see ARCHITECTURE.md §5.
10. **Board records are keyed by dimensions and mine count, never by the size/difficulty labels.** `setDimensions` gives a joining player the room's numbers and leaves `boardSize`/`difficulty` at whatever they last picked, so anything keyed on a label files a joiner's data under a board they never played. `lib/bestTimes.ts` derives the display name back from the numbers.
11. **Mine density has a measured ceiling.** Difficulty is a density in `shared/boardConfig.js`, and `Extreme` sits at 20.6% because that is the highest the no-guess generator can actually deliver — above it the retry loop exhausts and falls back to a guessy board *silently*. Don't raise a density, or lower `DEFAULT_MAX_ATTEMPTS`, without re-measuring the solvable rate; see ARCHITECTURE.md §5. Board dimensions come from the size axis, mines are always derived — never add a hand-typed mine count back.

## CI

`.github/workflows/ci.yml` runs on every PR and on `main` after merge, in two
jobs:

- **`checks`** — lint, `tsc --noEmit`, the client unit tests, the server tests, a production build.
- **`ui-smoke`** — `npm run test:ui` against a real stack: a `redis:7` service
  container, the backend and the Next dev server, driven through headless
  Chrome. Roughly two minutes.

`main` auto-deploys to Vercel and Heroku, so a red `main` means production is
about to be broken — treat it as an incident, not a chore.

They are separate jobs deliberately. `ui-smoke` is the flakiest thing in the
pipeline, and when it fails the lint and test results should still be readable
rather than buried under a browser timeout. Running it locally is still faster
than waiting for CI, but it is no longer the only thing standing between a
client regression and `main`.

`npm run verify:deploy` is NOT in CI: it plays a real game against production.
Run it after a release, by hand.

## Scoring

One point per safe cell a move opens, cascades included — the same rule for
clicks and chords, co-op and PVP. Both modes are compared directly in
`server/tests/scoringParity.test.js`; change one and that suite fails.

## Testing

Jest, in `server/tests/`, run from the repo root with `npm test`. Covers board
generation and the solver, board primitives and projection, payload validation,
mode dispatch, the Redis key schema and repositories, concurrent co-op moves, and
the `resetGame` require-order regression.

`io` and Redis are mocked globally by `server/tests/setup/mockInfra.js`, so no
test reaches real infrastructure; declare a per-file `jest.mock` when you need to
assert on them (`gameUtils.test.js` shows the pattern).

That mock hands back canned values with **no store behind them**, and settles in
call order, so it cannot show one write landing on top of another. Anything about
overlapping handlers uses `server/tests/setup/fakeRedis.js` instead — a real
in-memory store whose every command yields to the event loop, so two moves
interleave the way they do against a real server. `coopConcurrency.test.js` shows
the pattern: seed the room, fire two actions with `Promise.all`, assert on what
Redis ended up holding.

For the client, `npm run test:ui` drives the real app in headless Chrome against
a local backend (`scripts/ui-smoke/`). It needs `npm run dev:all` running first,
and uses the Chrome already on the machine — no extra dependencies. It covers
room creation, the first-click cascade, flagging, the flag counter, reset,
leaving, and a two-client PVP round. **Run it after touching `app/`,
`components/` or `hooks/`** — CI runs it too, but locally it is the faster loop.

`CI=1` adds `--no-sandbox` and `--disable-dev-shm-usage`, which the runner needs
and a laptop does not. Set it if you ever reproduce a CI-only browser failure.

It does not cover chording: making a chord do something visible requires knowing
where the mines are, and the client deliberately cannot see that (boards are
projected server-side). Chording is covered server-side instead, in
`server/tests/chord.test.js`.

`npm run test:client` is Vitest over the frontend directories. It holds two
kinds of test, told apart **per file** rather than by directory:

- **Pure logic** runs in Node and needs nothing. It exists because some client
  code is load-bearing and invisible when wrong: the WCAG maths behind the `/ds`
  contrast audit would otherwise report plausible, wrong numbers forever.
- **Component rendering** opts into a DOM with `// @vitest-environment jsdom` on
  the first line of the file. The fast majority never pays for one, and every
  file states what it needs.

Write component tests for what fails *silently* — the accessible name that
quietly stops resolving, the dialog button that stops closing, the copy that
stops appearing. `getByRole(role, { name })` is the workhorse: it fails both
when the role goes and when the name stops resolving, which is how most of these
break. Asserting a class name or a snapshot instead just pins the markup in
place and catches nothing.

jsdom has **no layout engine**, so it can tell you a control is unreachable by
name but never that it is off-screen, overlapping or the wrong size. It also
implements `<dialog>` without the bit where submitting a `method="dialog"` form
closes it. Anything in that territory belongs in the smoke suite instead.

`npm run verify:deploy` (`scripts/verify-deploy/`) is the only check that touches
the deployed stack. It connects real sockets to production — override with
`VERIFY_SERVER` — and plays enough of a game to prove the shared PVP board, the
scoring rule and the projection guarantee survived the deploy. Run it after a
release; it needs no local stack.

Note what it does NOT prove on its own: comparing the two `pvpBoardUpdate`
payloads passes even when the boards stored per player differ, because
`startPvpGame` emits the board it just built rather than what it wrote. That is
why the check plays a cell on both sides and compares the answers — only that
reads the stored boards back.
