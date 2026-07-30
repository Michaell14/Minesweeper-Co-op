# Minesweeper Co-op — Architecture

Real-time multiplayer Minesweeper with two modes: **co-op** (everyone shares one board) and **PvP** (two players race separate boards).

- **Frontend**: Next.js 14 App Router, React 18, TypeScript, Zustand, Chakra UI + Tailwind + NES.css. Deployed on Vercel.
- **Backend**: Node + Express + Socket.io, CommonJS, state in Redis. Deployed on Heroku as a *separate* package (`/server`).
- The two halves share no code today; the socket protocol is the only contract, and it is untyped on both sides.

---

## 1. Repository layout

```
app/                      Next.js App Router (client-side app; no server components, no API routes)
  page.tsx                "Home" — picks Landing vs Grid, owns the top-level dialogs
  store.ts                Re-exports the store from state/ (keeps the @/app/store path)
  layout.tsx              Metadata/SEO, fonts, Chakra provider, Footer
  globals.css
state/                    The Zustand store, one file per concern
  store.ts                Composes the slices
  types.ts                Cell, PlayerStats, PlayerHover
  gameSlice.ts            board, gameOver, gameWon
  boardConfigSlice.ts     rows/cols/mines, board size, difficulty, mode
  roomSlice.ts            room, players, scores, hovers
  pvpSlice.ts             everything 1v1
  inputSlice.ts           pointer state for chording and mobile flag mode
hooks/
  useSocket.ts            Socket lifecycle (create on mount, disconnect on unmount)
  useSocketEvents.ts      Registers a handler table; derives its own cleanup
  useGameEvents.ts        The server -> client handler table, co-op + PVP
  useGameActions.ts       Every client -> server emit
  useGameStats.ts         Remaining flags and PVP progress percentages
components/
  Grid.tsx                Layout only: one board, two control arrangements
  dialogs/
    GameDialogs.tsx       Game-over, room errors and PVP outcome dialogs
  game/                   Shared pieces used by both layouts
    Board.tsx             The grid of cells
    StatusBanner.tsx      PVP lobby states and win/loss badges
    ProgressBar.tsx       One PVP progress bar
    ScoreTable.tsx        Co-op leaderboard
    FlagCounter.tsx       Mines remaining
    Cell.tsx              One cell: mouse handling, hover highlight, memoized
    board.module.css      Board and cell styles
  Landing.tsx             Create/join forms, custom-size dialog, name dialogs
  Footer.tsx              GitHub link + how-to-play dialog
  ui/                     Generated Chakra snippets. Not hand-maintained
shared/                   Imported by BOTH halves; viable because the whole repo deploys (§6)
  boardConfig.js          Board sizes, difficulty densities, limits, validity rule
  events.js               Every socket event name, both directions
lib/
  dialogs.ts              Every dialog id, plus openDialog/closeDialog
  initSocket.ts           socket.io-client factory (URL from NEXT_PUBLIC_SOCKET_URL)
  throttle.ts             throttle() + generateColorFromId() for hover colors
  confetti.ts             canvas-confetti wrapper
types/
  canvas-confetti.d.ts    Local typings for a dependency that ships none
scripts/
  ensure-redis.js         Dev helper: starts local Redis if port 6379 is closed
  ui-smoke/               Headless-Chrome smoke test for the client (npm run test:ui)
server/                   Separate npm package (own package.json, lockfile, node_modules)
  server.js               Every socket.on handler + isValid() room/membership guard
  config.js               Env-resolved settings: allowed CORS origins, PORT
  validation.js           Pure socket payload validators (limits, coords, membership)
  data/
    keys.js               Every Redis key and TTL. Nothing else builds a key by hand
    roomRepo.js           All room reads/writes, incl. board JSON, players list and locks
    playerRepo.js         All player reads/writes
    sessionRepo.js        Browser sessions, mapping a stable id onto the current socket
  domain/
    board.js              Dependency-free board primitives (createEmptyBoard, getAdjacentCells,
                          revealFrom, projectBoard/projectCells)
  game/
    index.js              Mode dispatch — the ONLY place that decides co-op vs PVP
    coop.js               Shared-board cell actions, broadcast to the room
    pvp.js                Per-player cell actions, emitted to one socket
  controllers/
    pvpController.js      PVP lifecycle: startPvpGame / resetMyBoard / pvpRematch
  utils/
    gameUtils.js          Board generation, checkWin, createRoom, resetGame
    playerUtils.js        Join/leave, score stats, PVP disconnect handling
    solverUtils.js        No-guess solvability engine (pure, no I/O — the only dependency-free module)
    initializeClient.js   Express app + io singleton + CORS
    initializeRedisClient.js  Redis singleton (exported as a Promise)
  tests/                  Jest (`npm test` from /server, or `npm test` at the repo root)
```

---

## 2. Client architecture

### Component tree

```
layout.tsx → Provider (Chakra/next-themes) → page.tsx + Footer + Analytics
page.tsx ──┬→ Landing   (when !playerJoined)
           └→ Grid      (when playerJoined) → Cell[][]
```

`page.tsx` drills 11 callbacks from `useGameActions` into `Grid`, which drills 4 into each `Cell`. Everything else flows through the Zustand store.

Socket wiring lives in `hooks/`. Handlers and actions read and write the store
through `useMinesweeperStore.getState()` rather than subscribing, so they cause
no re-renders and the callbacks stay referentially stable for the life of a
socket. `page.tsx` itself subscribes only to `playerJoined` and `gameOverName`.

### State (`state/`, re-exported by `app/store.ts`)

One store, assembled from five slices:

| Group | Fields |
|---|---|
| Game | `board`, `gameOver`, `gameWon` |
| Board config | `numRows`, `numCols`, `numMines`, `boardSize`, `difficulty`, `mode` |
| Room/player | `room`, `playerJoined`, `name`, `playerStatsInRoom`, `gameOverName`, `playerHovers` |
| PVP | `pvpStarted`, `pvpOpponentName`, `pvpOpponentStatus`, `pvpWinner`, `pvpRoomReady`, `pvpIsHost`, `pvpOpponentProgress`, `pvpTotalSafeCells` |
| Mouse/UI | `isChecked` (mobile click-vs-flag), `r`, `c`, `leftClick`, `rightClick`, `bothPressed` |

Each row above is one slice file. Slices are plain creators sharing one `set`, so
a slice can write another's fields where that is genuinely the behaviour —
`resetPvpState` clears `gameOver`/`gameWon` because a rematch must.

Every field has its own setter, plus `resetPvpState()` (which also clears `gameOver`/`gameWon`).

**Subscription note:** every consumer now subscribes with per-field selectors —
`page.tsx` to just `playerJoined` and `gameOverName`, `Grid.tsx` to the fields it
renders, and `Cell.tsx` to its own cell's hover. Nothing calls
`useMinesweeperStore()` bare any more, so a remote hover update no longer
re-renders the page and the whole grid. Keep it that way when adding state.

---

## 3. Server architecture

### Module dependencies

```
server.js ─→ initializeClient (io) , validation , playerUtils , gameUtils , game , data/* , pvpController
game/index ─→ game/coop , game/pvp , data/*
game/coop ─→ gameUtils , playerUtils , domain/board , data/* , io
game/pvp ─→ gameUtils , playerUtils , domain/board , data/* , io
pvpController ─→ domain/board , playerUtils , validation , data/*
gameUtils ─→ solverUtils , domain/board , data/roomRepo , io
playerUtils ─→ domain/board , data/* , io
data/roomRepo , data/playerRepo ─→ data/keys , redis
data/keys ─→ (nothing)
domain/board ─→ (nothing)
validation ─→ (nothing)
```

> `gameUtils` and `playerUtils` used to require each other, which meant `gameUtils`
> captured `undefined` for `resetPlayerScores`/`updatePlayerStatsInRoom` and
> `resetGame()` threw silently. `domain/board.js` exists to give both a shared,
> dependency-free source for board helpers. **Keep it dependency-free, and don't
> reintroduce imports between `gameUtils` and `playerUtils`** —
> `tests/resetGame.test.js` guards this and depends on its own require order.

`redisClient` is imported only by `data/`. `io` is still a module-scope singleton imported wherever something emits, so handlers need it mocked to be tested (see `server/tests/setup/mockInfra.js`, which mocks both globally).

### Request path

1. Client emits → handler in `server.js`
2. Payload validation via `server/validation.js` (pure, no I/O), then `isValid(room)` — room exists, player exists, player is in the room's `players` array
3. `game/index.js` loads the room hash from Redis and **dispatches on `roomState.mode`** to `game/coop.js` or `game/pvp.js`, passing the state it already read
4. Board JSON is mutated and written back
5. The result is **projected** (see §3.1) and emitted via `io.to(room)` (co-op) or `io.to(socketId)` (PVP)

### 3.1 Board projection — what a client is allowed to see

Redis holds the full truth; clients never do. Every board or cell payload passes
through `projectBoard` / `projectCells` in `domain/board.js` first:

| Cell state | `isMine` | `nearbyMines` | `isFlagged` |
|---|---|---|---|
| open | real | real | real |
| closed | always `false` | always `0` | real (flags are shared state) |
| any, once that player's game is over or won | real | real | real |

Closed cells hide `nearbyMines` as well as `isMine` — the neighbour count of an
unopened cell is nearly as good as the answer, since it lets you solve the board
offline.

**Consequence for terminal states:** because clients are no longer told the
layout up front, the server must actively push a revealed board when a game
ends, or the UI would show a single detonated mine and nothing else. That is why
`coop.reveal` emits a revealed `boardUpdate` to the room on a loss, `pvp.reveal`
emits a revealed `pvpBoardUpdate` to the losing player only, and `checkWin` emits
a revealed board on a win.

Anything added here that emits a board or cell list **must** project it. The
`server/tests/board.test.js` projection suite and the mid-game-joiner case are
the guardrails.

### Redis data model

Defined in `server/data/keys.js`; all access goes through `roomRepo` / `playerRepo`.
Nothing outside `server/data` should build a key or touch the Redis client directly.

**`room:<roomCode>`** — TTL 24h
`mode` `noGuess` `gameOver` `gameWon` `gameOverName` `initialized` `players` (JSON array of socket ids) `numRows` `numCols` `numMines` `board` (co-op only, JSON)

PVP adds: `pvpStarted` `hostSocket` `player1Socket` `player2Socket` `player{1,2}Board` `player{1,2}Initialized` `player{1,2}GameOver` `player{1,2}GameWon` `player{1,2}Progress` `totalSafeCells` `winnerSocket` `sharedBoardSeed` *(written, never read)*

PVP additionally stores `sharedBoard` and `sharedOpenedCells`: the pristine
starting layout and how many cells its opening revealed, so `resetMyBoard` can
put a player back to the start rather than onto a board of their own.

**`session:<sessionId>`** — TTL 24h
`room` `name` `socketId`. The client keeps `sessionId` in sessionStorage (per tab,
survives reload) and sends it in the socket handshake, so a reconnecting player
can be swapped back into their slot instead of joining as a stranger.

**`player:<socketId>`** — TTL 24h
`room` `name` `score`, plus `pvpPlayerIndex` and `opponentName` in PVP

**Locks** — `SET NX EX 10`
`init_lock:<room>` (co-op first click) · `winner_lock:<room>` (PVP win claim)

Players are keyed by socket id, so a reconnect is a new player row.

---

## 4. Socket protocol

### Client → Server

| Event | Payload | Handler |
|---|---|---|
| `createRoom` | `{room, numRows, numCols, numMines, name, mode}` | `server.js:12` |
| `joinRoom` | `{room, name}` | `server.js:67` |
| `openCell` | `{room, row, col}` | `server.js:170` |
| `chordCell` | `{room, row, col}` | `server.js:187` |
| `toggleFlag` | `{room, row, col}` | `server.js:202` |
| `emitConfetti` | `{room}` | `server.js:217` |
| `cellHover` | `{room, row, col}` — `-1,-1` clears | `server.js:229` |
| `resetGame` | `{room}` | `server.js:269` |
| `startPvpGame` | `{room}` | `pvpController.js:7` |
| `resetMyBoard` | `{room}` | `pvpController.js:87` |
| `pvpRematch` | `{room}` | `pvpController.js:146` |
| `playerLeave` | — | `server.js:293` |

Shapes are typed in `shared/socketPayloads.ts` (`ClientToServerEvents`).

### Server → Client — shared / co-op

| Event | Payload |
|---|---|
| `joinRoomSuccess` | `{room, mode, isHost, numRows?, numCols?, numMines?}` |
| `joinRoomError` / `createRoomError` / `roomDoesNotExistError` | — |
| `boardUpdate` | `Cell[][]` (full board: join, reset, first click, win, loss). **Projected** — see §3.1 |
| `updateCells` | `{row, col, isMine, isOpen, isFlagged, nearbyMines}[]` |
| `playerStatsUpdate` | `{name, score}[]` |
| `gameWon` | — |
| `gameOver` | `playerName` |
| `resetEveryone` | — |
| `receiveConfetti` | — |
| `playerHoverUpdate` | `{id, row, col, name}` (client derives color from `id`) |
| `playerLeft` | `socketId` |

### Server → Client — PVP

| Event | Payload |
|---|---|
| `pvpRoomFull` | — |
| `pvpRoomReady` | `{opponentName, isHost}` |
| `pvpGameStarted` | `{totalSafeCells}` |
| `pvpBoardUpdate` | `{board, playerIndex, opponentName?, opponentProgress?, totalSafeCells?}` |
| `pvpUpdateCells` | same shape as `updateCells` |
| `pvpGameOver` | — (only to the player who hit a mine) |
| `pvpOpponentFailed` / `pvpOpponentReset` / `pvpOpponentLeftBeforeStart` / `pvpHostTransferred` | — |
| `pvpPlayerWon` | `{winnerSocket, winnerName}` |
| `pvpOpponentProgress` | `{progress, totalSafeCells, percentage}` |
| `pvpOpponentDisconnected` | `{winnerSocket, winnerName}` |
| `pvpRematchStarted` | `{totalSafeCells, isHost}` |

Shapes are typed in `shared/socketPayloads.ts` (`ServerToClientEvents`).

Event names come from `shared/events.js` and the payload shapes above are typed
in `shared/socketPayloads.ts`, so the tables in this section describe the
protocol but are no longer the only record of it.

`server/tests/events.test.js` enforces that both halves use the constants, that
the client's table covers exactly what the server sends, that
`shared/events.d.ts` matches the runtime names, and that every event has a
declared payload type.

**The types bind the client only.** They are TypeScript, and the server is
CommonJS, so `tsc` checks every client emit and handler against them while the
server could still send something else. The server's own guard for INBOUND
payloads is `server/validation.js`; what it SENDS is kept in step by hand. That
is the one seam in the protocol without a mechanical check.

Listeners live in one table in `hooks/useGameEvents.ts`. `useSocketEvents` registers it and derives the teardown from what it registered, unregistering the specific handler rather than every listener for that event name. Adding an event means adding one entry to that table (plus the server emit).

---

## 5. Game systems

### No-guess board generation
`generateBoard()` runs a generate-and-verify loop: it produces a candidate via Fisher-Yates placement excluding the 3x3 zone around the first click, then asks `isBoardSolvable()` (`solverUtils.js:52`) whether the board can be cleared by pure logic. Up to `DEFAULT_MAX_ATTEMPTS` (300) attempts; if none is solvable it returns the first candidate. The solver applies (1) single-cell deduction and (2) subset reduction over overlapping neighborhoods, iterating until no progress.

Boards are generated lazily on the **first click**, guarded by a Redis `SET NX` lock; a losing racer polls up to 5×100ms for the winner's board.

> **Mine density is capped by this loop, not by taste.** The fallback is silent —
> an unsolvable board is indistinguishable from a real result — so the ceiling on
> difficulty is wherever the solver stops finding layouts. Measured
> per-candidate solvable rates on a 20x16: 18.8% → 17%, 20.6% → 7%, 22% → 3%,
> 24% → 0.3%. At 300 attempts, 20.6% never fell back across 200 games on every
> shipped size; 22% still did. That is why `Extreme` is 20.6% and why the
> attempt count is 300 rather than the 50 it was before Extreme existed.
> Raising the density without re-measuring quietly turns the no-guess guarantee
> off.

### Board size and difficulty
Two independent axes on the landing page: size gives the dimensions, difficulty gives a **mine density**. Only the resulting `numRows`/`numCols`/`numMines` cross the wire — the server never sees a size or difficulty name, which is why the split needed no protocol change.

The two are combined in exactly one place: `setBoardConfig()` in `state/boardConfigSlice.ts`, which calls `mineCountFor()` (`shared/boardConfig.js`) to derive the mine count and writes dimensions, mines and both labels atomically. Landing's radio cards call it directly rather than deriving anything themselves — the derivation living in the store, not the component, is what stops a second caller from writing dimensions that disagree with the size/difficulty labels. `setDimensions` still exists as a raw override with no label attached, used only by `joinRoomSuccess` to sync a joining player's flag counter to numbers the server already picked.

The densities are picked so the three pre-split presets stay reachable on the diagonal: Small+Easy is 9x9/10, Medium+Medium is 16x16/40, Large+Hard is 20x16/60. A custom board supplies its own dimensions and takes its mine count from the selected difficulty like any other size; there is no hand-typed mine count any more. `server/tests/boardConfig.test.js` pins all of this down.

### Co-op flow
Create room → board is an empty grid → first click generates mines → `reveal()` flood-fills → `updateCells` broadcast to the room → `checkWin` auto-flags remaining mines and emits `gameWon`. Hitting a mine sets `gameOver` for everyone and names the player who hit it.

### PVP flow
Create room with `mode: 'pvp'` (creator becomes `hostSocket`) → second player joins (a third gets `pvpRoomFull`) → both receive `pvpRoomReady` → **host** emits `startPvpGame`, which builds ONE board and gives it to both players → progress is broadcast to the opponent as a percentage → first to clear wins (guarded by `winner_lock`). A player who hits a mine can `resetMyBoard` and keep racing. The host can trigger `pvpRematch`. Disconnecting mid-game hands the win to the opponent.

> **Both players race the same board.** `startPvpGame` generates one layout,
> no-guess verified around a cell at the centre, opens that cell, and stores it as
> both `player1Board` and `player2Board` (plus a pristine `sharedBoard` copy for
> resets). The boards then diverge only through play.
>
> The first-click guarantee moves rather than disappearing. Generating around
> each player's own first click is what used to make the layouts differ, so
> instead the game opens a safe cell for both players before either clicks —
> nobody can lose on move one, and neither starts from a blank grid.

### Chording
Both mouse buttons pressed together, or the middle button. `Cell.tsx` writes `leftClick`/`rightClick`/`r`/`c` into the store; the chording `useEffect` in `Grid.tsx` watches for both being true and calls `chordCell(r, c)`; `bothPressed` suppresses the open/flag that would otherwise fire on mouse-up. The server opens all unflagged neighbors when the flag count matches the cell's number.

### Hover presence (co-op only)
`Cell` `onMouseEnter` → throttled 100ms → `cellHover` → server broadcasts `playerHoverUpdate` to everyone else → each client colors the cell using a hash of the socket id. Suppressed in PVP (`server.js:251`).

### Mobile flag mode
`isChecked` toggles tap-to-open vs tap-to-flag. `Grid` renders a separate mobile tree below the `xl` breakpoint; `Cell` renders both a `hideFrom="xl"` and a `hideBelow="xl"` hit area.

---

## 6. Branches and deploys

**`main` is the trunk.** It is the GitHub default branch and the only branch
anything deploys from. Branch off it, PR back into it.

There used to be a second long-lived branch, `stable`, which drifted 49 commits
ahead of `main` while `main` was what actually shipped — so a lot of merged work
was never deployed. It has been retired; do not recreate that pattern.

| Target | Source | How |
|---|---|---|
| Frontend (Vercel) | `main` | on push |
| Backend (Heroku) | `main` | GitHub auto-deploy, whole repo |

**Node is pinned to 22.x** via `engines.node` in the root `package.json`, which
is what the Heroku buildpack reads. Vercel and CI use 22 too, so the runtime that
serves production is the one the tests run on. `.nvmrc` mirrors it for local
work. Before this was pinned the buildpack took "current LTS" and the dyno drifted
to Node 24 while everything else stayed on 22.

**Heroku deploys the whole repository**, not just `server/`. The Node buildpack
runs `npm install` at the root, then `heroku-postbuild` (`cd server && npm
install`), and the root `/Procfile` starts it with `web: cd server && node
server.js`.

So the **root `/Procfile` and the root `heroku-postbuild` script are
load-bearing** — editing or removing either breaks the deploy. There is exactly
one Procfile now: `server/Procfile` (`web: node server.js`) used to sit
alongside it, left over from an older `git subtree push --prefix server heroku
main` model, and was removed once `heroku ps` confirmed the dyno runs the root
one. Two Procfiles with different commands invited editing the wrong one; if the
subtree model is ever restored, the deleted file is one line.

Because the whole repo ships, server code *may* import from outside `server/`,
which is what makes a shared client/server module possible. That is a property
of this deploy model, not of the code: switching back to a subtree push would
break any such import, since only `server/` would be pushed.

`heroku-postbuild` is confirmed to run and succeed in the build log, so
`server/node_modules` exists on the dyno and the server resolves its own
dependencies. The root `package.json` therefore lists only what the frontend
needs; the server's are declared once, in `server/package.json`.

## 7. Development

```bash
npm install                # frontend deps (repo root)
npm --prefix server install   # backend deps
npm run dev:all            # starts local Redis if needed, then server (:3001) + Next (:3000)
npm test                   # server test suite (Jest) — proxies to `npm --prefix server test`
npm run test:ui            # client smoke test in headless Chrome (needs dev:all running)
                           # also runs in CI, as its own job with a redis service
npm run verify:deploy      # plays a real game against the DEPLOYED backend; not in CI
npm run lint
```

Local Redis is expected on `127.0.0.1:6379`; `scripts/ensure-redis.js` will try to start it.

**Configuration.** Every variable has a working default, so an unset one keeps
the previous hardcoded behaviour. See `.env.example` and `server/.env.example`.

| Variable | Where | Default |
|---|---|---|
| `NEXT_PUBLIC_SOCKET_URL` | client | localhost:3001 in dev, the Heroku app in prod. Inlined at build time |
| `ALLOWED_ORIGINS` | server | comma-separated; falls back to localhost:3000 plus the deployed frontends |
| `PORT` | server | 3001 |
| `HOST`, `REDIS_PORT`, `DB_PASS` | server | local Redis with no auth |

**Tests.** `server/tests/` covers the server with Jest and no real infrastructure.
`scripts/ui-smoke/` drives the actual client in headless Chrome against a local
backend — the only automated frontend coverage there is. See CLAUDE.md.

---

## 8. Known issues and gotchas

These are real, currently unfixed, and worth knowing before changing related code.

1. **Heroku installs the whole frontend dependency tree and never uses it.** The root `npm install` pulls Next, React, Chakra and the rest onto a dyno that only runs `cd server && node server.js`; `heroku-postbuild` replaces the `build` script, so the frontend is never built there. Wasted build time and slug size, not a correctness problem.

*Fixed, kept here so they aren't reintroduced:* the `gameUtils` ⇄ `playerUtils`
require cycle that silently broke co-op score resets (see §3); the stale room
snapshot that let a chord into a mine also announce a win; the
`pvpPlayerIndex || '0'` fallback that let an unassigned socket write another
player's board; the per-mode scoring split (below); and the duplicate
`server/Procfile`, which said `web: node server.js` while the deploy ran the
root one's `cd server && node server.js`. All but the Procfile are covered by
tests; that one is covered by there being only one file to get wrong.

**Scoring, both modes.** One point per safe cell a move opens, cascades
included, whether the move was a click or a chord and whether the room is co-op
or PVP. Co-op used to score one point per *click* — so a click that cascaded
fifty cells open was worth the same as one that opened a single square, and it
disagreed with co-op's own chording, which already scored per cell.
`server/tests/scoringParity.test.js` runs the same board and the same move
through both modes and compares, so the two can't drift apart again.

## 9. Single sources of truth (and where they aren't)

| Concept | Where it lives | Duplicates to keep in sync |
|---|---|---|
| Socket payload shapes | `shared/socketPayloads.ts` | Client-side only; the server is unchecked (§4) |
| Board sizes and difficulty densities | `shared/boardConfig.js` | — |
| Board size/mine rules | `shared/boardConfig.js` | — |
| Socket event names | `shared/events.js` | — |
| Redis key names | `server/data/keys.js` | — |
| CORS origins | `server/config.js` | — |
| Backend URL | `lib/initSocket.ts` (`NEXT_PUBLIC_SOCKET_URL`) | — |
| Cell reveal (flood fill) | `domain/board.js` `revealFrom()` | each mode wraps it to react to a mine: co-op ends the room's game, PVP ends only that player's |
| Neighbor enumeration | `domain/board.js` `getAdjacentCells()` | plus `solverUtils.js:10` (`getAdjacentCoords`) and inline loops in `gameUtils.js:56` and `:250` |
| Board rendering | `components/game/Board.tsx` | still mounted by both layout wrappers, so the DOM holds two copies; the markup exists once |
