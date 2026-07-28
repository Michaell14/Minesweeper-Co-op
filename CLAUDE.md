# CLAUDE.md

Guidance for AI agents working in this repo. Read `ARCHITECTURE.md` for the full system map, socket protocol, and Redis schema.

## What this is

Real-time multiplayer Minesweeper. Two deployables in one repo:

- **Frontend** — Next.js 14 App Router at the repo root (`app/`, `components/`, `lib/`). TypeScript, Zustand, Chakra + Tailwind + NES.css. Vercel.
- **Backend** — `server/`, a **separate npm package** with its own `package.json`, lockfile, and `node_modules`. CommonJS, Express + Socket.io, state in Redis. Heroku.

They share no code. The socket protocol is the only contract and it is untyped on both sides — event names are string literals in both halves.

## Commands

```bash
npm run dev:all            # Redis (auto-start) + backend :3001 + frontend :3000
npm run dev                # frontend only
npm run start-server       # backend only
npm test                   # server Jest suite (proxies to `npm --prefix server test`)
npm run test:ui            # browser smoke test; needs dev:all running
npm run lint
npm run build
```

Backend deps install separately: `npm --prefix server install`.

## Conventions

- 4-space indent (except `app/layout.tsx`, which is 2). No Prettier configured.
- Server is **CommonJS** (`require`/`module.exports`); client is ESM + TypeScript. Do not mix.
- Client imports use the `@/` alias (`@/components/...`, `@/lib/...`, `@/app/store`).
- Redis values are all strings — booleans are stored as `'true'`/`'false'` and compared as strings, and numbers need `parseInt(..., 10)`.
- **Go through `server/data/roomRepo` / `playerRepo`.** Don't import the Redis client or build a key string outside `server/data`. A mistyped key is a silent no-op, not an error.
- Socket handlers validate payloads with helpers from `server/validation.js`, then call `isValid(room)` before touching state. Follow that order for new handlers, and add new rules to `validation.js` rather than inline.
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
| Board generation, win check, room creation | `server/utils/gameUtils.js` |
| No-guess solvability | `server/utils/solverUtils.js` (pure — easiest place to add tests) |
| Join/leave, scores, disconnects | `server/utils/playerUtils.js` |
| Redis schema / any data access | `server/data/keys.js`, `server/data/roomRepo.js`, `server/data/playerRepo.js` |
| Client state | `app/store.ts` |
| Board/controls UI | `components/game/` (Board, StatusBanner, ProgressBar, ScoreTable, FlagCounter); `components/Grid.tsx` is layout only |
| Cell interaction | `components/game/Cell.tsx` |
| Room create/join UI | `components/Landing.tsx` |
| Dialogs | `lib/dialogs.ts` for ids and `openDialog`/`closeDialog`; markup in `components/dialogs/GameDialogs.tsx`, `Grid.tsx`, `Landing.tsx`, `Footer.tsx` |

## Traps

Read `ARCHITECTURE.md` §7-8 before changing server code. The ones most likely to bite:

1. **Don't reintroduce imports between `gameUtils` and `playerUtils`.** They used to require each other, which made `resetGame()` throw silently depending on load order. Shared board helpers go in `server/domain/board.js`, which must stay dependency-free. `tests/resetGame.test.js` guards this and its require order is load-bearing.
2. **Some things still need multi-file edits.** Difficulty defaults live in 4 places, board-size rules in 2 (with different limits), and socket event names are string literals on both sides. Grep before assuming one edit is enough — ARCHITECTURE.md §8 has the table. (Redis keys and validation rules are no longer in this category.)
3. **`components/Grid.tsx` still has two layout wrappers** (desktop `hideBelow="xl"`, mobile `hideFrom="xl"`), so the board mounts twice in the DOM. Their *content* is now shared via `components/game/`, so edit the component, not the wrapper. Where the layouts genuinely differ, it is an explicit prop (`variant`), not a second copy.
4. **Socket handlers go in the `hooks/useGameEvents.ts` table**, not in a component. Registration and cleanup are derived from that table; don't call `socket.on` directly.
5. **Dialogs are native `<dialog>` elements**, opened imperatively via `openDialog(DIALOGS.x)`. NES.css styling and the `form method="dialog"` close behaviour depend on that, so don't convert them to conditional rendering casually. Never type a dialog id as a string literal — import it from `lib/dialogs.ts`.
6. **`components/ui/` is generated Chakra code.** Don't hand-edit it.
7. **PVP players get different boards** — this is current behavior, not a bug to "fix" incidentally.
8. **Two Procfiles exist** with different deploy models. Don't delete either without confirming which one Heroku uses.

## Testing

Jest, in `server/tests/`, run from the repo root with `npm test`. Covers board
generation and the solver, board primitives and projection, payload validation,
mode dispatch, the Redis key schema and repositories, and the `resetGame`
require-order regression.

`io` and Redis are mocked globally by `server/tests/setup/mockInfra.js`, so no
test reaches real infrastructure; declare a per-file `jest.mock` when you need to
assert on them (`gameUtils.test.js` shows the pattern).

For the client, `npm run test:ui` drives the real app in headless Chrome against
a local backend (`scripts/ui-smoke/`). It needs `npm run dev:all` running first,
and uses the Chrome already on the machine — no extra dependencies. It covers
room creation, the first-click cascade, flagging, the flag counter, reset,
leaving, and a two-client PVP round. **Run it after touching `app/`,
`components/` or `hooks/`.**

It does not cover chording: making a chord do something visible requires knowing
where the mines are, and the client deliberately cannot see that (boards are
projected server-side). Test chording against the server.

There are no component unit tests, so anything below that level still needs a
manual pass.
