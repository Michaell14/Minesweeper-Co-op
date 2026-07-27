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
npm run lint
npm run build
```

Backend deps install separately: `npm --prefix server install`.

## Conventions

- 4-space indent (except `app/layout.tsx`, which is 2). No Prettier configured.
- Server is **CommonJS** (`require`/`module.exports`); client is ESM + TypeScript. Do not mix.
- Client imports use the `@/` alias (`@/components/...`, `@/lib/...`, `@/app/store`).
- Redis values are all strings — booleans are stored as `'true'`/`'false'` and compared as strings, and numbers need `parseInt(..., 10)`.
- Socket handlers validate payloads with helpers from `server/validation.js`, then call `isValid(room)` before touching state. Follow that order for new handlers, and add new rules to `validation.js` rather than inline.
- Board cells are always `{ isMine, isOpen, isFlagged, nearbyMines }`.
- **Never emit a board or cell list straight from Redis.** Run it through `projectBoard` / `projectCells` (`server/domain/board.js`) so closed cells don't leak `isMine` or `nearbyMines`. Pass `{ revealMines: true }` only for terminal states. See ARCHITECTURE.md §4.1.

## Where things live

| Task | File |
|---|---|
| Add/modify a socket event | `app/page.tsx` (emit + `on` + `off` list + dep array), `server/server.js` |
| Co-op cell actions | `server/game/coop.js` |
| PVP cell actions | `server/game/pvp.js` |
| Deciding which mode handles an action | `server/game/index.js` — the only dispatch point |
| PVP lifecycle (start/reset/rematch) | `server/controllers/pvpController.js` |
| Board generation, win check, room creation | `server/utils/gameUtils.js` |
| No-guess solvability | `server/utils/solverUtils.js` (pure — easiest place to add tests) |
| Join/leave, scores, disconnects | `server/utils/playerUtils.js` |
| Client state | `app/store.tsx` |
| Board/controls UI | `components/Grid.tsx` (desktop **and** mobile trees) |
| Cell interaction | `components/Cell.tsx` |
| Room create/join UI | `components/Landing.tsx` |

## Traps

Read `ARCHITECTURE.md` §7-8 before changing server code. The ones most likely to bite:

1. **Don't reintroduce imports between `gameUtils` and `playerUtils`.** They used to require each other, which made `resetGame()` throw silently depending on load order. Shared board helpers go in `server/domain/board.js`, which must stay dependency-free. `tests/resetGame.test.js` guards this and its require order is load-bearing.
2. **Multi-file edits are the norm, not the exception.** Difficulty defaults live in 4 places; board-size rules in 2 (with different limits); socket event names and Redis key strings are unmanaged literals across 5+ files. Grep before assuming one edit is enough — §8 has the table.
3. **`components/Grid.tsx` renders the board twice** (desktop `hideBelow="xl"`, mobile `hideFrom="xl"`). A UI change usually needs both, and the two copies have already diverged.
4. **`page.tsx` cleanup is hand-maintained.** New `socket.on` needs a matching `socket.off` or the listener leaks across reconnects.
5. **`components/ui/` is generated Chakra code.** Don't hand-edit it.
6. **PVP players get different boards** — this is current behavior, not a bug to "fix" incidentally.
7. **Two Procfiles exist** with different deploy models. Don't delete either without confirming which one Heroku uses.

## Testing

Jest, in `server/tests/`, run from the repo root with `npm test`. Coverage is the pure layer only: board generation (`gameUtils.test.js`, `versusMode.test.js`) and the solver (`solverUtils.test.js`).

Anything touching `io` or Redis needs mocks — `server/tests/gameUtils.test.js` has the working pattern (`jest.mock` of `initializeClient` and `initializeRedisClient`). There are no client tests; changes to `Grid`/`Cell`/`page` must be verified by running the app.
