# Minesweeper Co-op — Architecture

Real-time multiplayer Minesweeper with two modes: **co-op** (everyone shares one board) and **PvP** (two players race separate boards).

- **Frontend**: Next.js 14 App Router, React 18, TypeScript, Zustand, Chakra UI + Tailwind + NES.css. Deployed on Vercel.
- **Backend**: Node + Express + Socket.io, CommonJS, state in Redis. Deployed on Heroku as a *separate* package (`/server`).
- The two halves share no code today; the socket protocol is the only contract, and it is untyped on both sides.

---

## 1. Repository layout

```
app/                      Next.js App Router (client-side app; no server components, no API routes)
  page.tsx                "Home" — owns the socket, all 27 listeners, all emit fns, top-level dialogs
  store.tsx               Zustand store: game + room + PVP + mouse/UI state
  layout.tsx              Metadata/SEO, fonts, Chakra provider, Footer
  globals.css
components/
  Grid.tsx                Board, controls, stats, PVP progress. Renders a desktop tree AND a mobile tree
  Cell.tsx                One cell: mouse handling, hover highlight, memoized
  Landing.tsx             Create/join forms, custom-difficulty dialog, name dialogs
  Footer.tsx              GitHub link + how-to-play dialog
  Home.module.css         Board/cell styles (used by Grid and Cell — the name is historical)
  ui/                     Generated Chakra snippets. Not hand-maintained
lib/
  difficultyConfig.tsx    Easy/Medium/Hard presets
  initSocket.js           socket.io-client factory (server URL is hardcoded per NODE_ENV)
  throttle.ts             throttle() + generateColorFromId() for hover colors
  confetti.js             canvas-confetti wrapper
scripts/ensure-redis.js   Dev helper: starts local Redis if port 6379 is closed
server/                   Separate npm package (own package.json, lockfile, node_modules)
  server.js               Every socket.on handler + isValid() room/membership guard
  validation.js           Pure socket payload validators (limits, coords, membership)
  domain/
    board.js              Dependency-free board primitives (createEmptyBoard, getAdjacentCells)
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
    types.ts              DEAD: TypeScript types in a CommonJS JS server, imported by nothing
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

`page.tsx` owns the socket in `useState` and drills 11 callbacks into `Grid`, which drills 4 into each `Cell`. There is no socket service or context; everything else flows through the Zustand store.

### State (`app/store.tsx`)

One store, four concerns:

| Group | Fields |
|---|---|
| Game | `board`, `gameOver`, `gameWon` |
| Board config | `numRows`, `numCols`, `numMines`, `difficulty`, `mode` |
| Room/player | `room`, `playerJoined`, `name`, `playerStatsInRoom`, `gameOverName`, `playerHovers` |
| PVP | `pvpStarted`, `pvpPlayerIndex`, `pvpOpponentName`, `pvpOpponentStatus`, `pvpWinner`, `pvpRoomReady`, `pvpIsHost`, `pvpOpponentProgress`, `pvpTotalSafeCells` |
| Mouse/UI | `isChecked` (mobile click-vs-flag), `r`, `c`, `leftClick`, `rightClick`, `bothPressed` |

Every field has its own setter, plus `resetPvpState()` (which also clears `gameOver`/`gameWon`).

**Subscription note:** `Cell.tsx` subscribes with fine-grained selectors. `page.tsx` and `Grid.tsx` call `useMinesweeperStore()` with no selector, so both re-render on *any* store write — including `playerHovers`, which updates on every remote hover event.

---

## 3. Server architecture

### Module dependencies

```
server.js ─→ initializeClient (io) , validation , playerUtils , gameUtils , game , redis , pvpController
game/index ─→ game/coop , game/pvp , redis
game/coop ─→ gameUtils , playerUtils , domain/board , io , redis
game/pvp ─→ gameUtils , playerUtils , domain/board , io , redis
pvpController ─→ domain/board , playerUtils , validation
gameUtils ─→ solverUtils , domain/board , io , redis
playerUtils ─→ domain/board , io , redis
domain/board ─→ (nothing)
validation ─→ (nothing)
```

> `gameUtils` and `playerUtils` used to require each other, which meant `gameUtils`
> captured `undefined` for `resetPlayerScores`/`updatePlayerStatsInRoom` and
> `resetGame()` threw silently. `domain/board.js` exists to give both a shared,
> dependency-free source for board helpers. **Keep it dependency-free, and don't
> reintroduce imports between `gameUtils` and `playerUtils`** —
> `tests/resetGame.test.js` guards this and depends on its own require order.

`io` and `redisClient` are imported as module-scope singletons in five files, so no handler can be exercised without a live Redis unless those modules are mocked (see `server/tests/gameUtils.test.js` for the mocking pattern).

### Request path

1. Client emits → handler in `server.js`
2. Payload validation via `server/validation.js` (pure, no I/O), then `isValid(room)` — room exists, player exists, player is in the room's `players` array
3. `game/index.js` loads the room hash from Redis and **dispatches on `roomState.mode`** to `game/coop.js` or `game/pvp.js`, passing the state it already read
4. Board JSON is mutated and written back
5. `io.to(room)` (co-op) or `io.to(socketId)` (PVP) emits the result

### Redis data model

Keys are built inline as template strings in four files. There is no schema module.

**`room:<roomCode>`** — TTL 24h
`mode` `noGuess` `gameOver` `gameWon` `gameOverName` `initialized` `players` (JSON array of socket ids) `numRows` `numCols` `numMines` `board` (co-op only, JSON)

PVP adds: `pvpStarted` `hostSocket` `player1Socket` `player2Socket` `player{1,2}Board` `player{1,2}Initialized` `player{1,2}GameOver` `player{1,2}GameWon` `player{1,2}Progress` `totalSafeCells` `winnerSocket` `sharedBoardSeed` *(written, never read)*

**`player:<socketId>`** — TTL 24h
`room` `name` `score`, plus `pvpPlayerIndex` and `opponentName` in PVP

**Locks** — `SET NX EX 10`
`init_lock:<room>` (co-op first click) · `init_lock_pvp:<room>:<playerIndex>` · `winner_lock:<room>`

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

### Server → Client — shared / co-op

| Event | Payload |
|---|---|
| `joinRoomSuccess` | `{room, mode, isHost, numRows?, numCols?, numMines?}` |
| `joinRoomError` / `createRoomError` / `roomDoesNotExistError` | — |
| `boardUpdate` | `Cell[][]` (full board: join, reset, first click, win) |
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

Listeners are registered in `page.tsx:111-446` and torn down by a **hand-maintained** `socket.off` list at `page.tsx:417-445`. Adding an event means editing the emit site, the `on`, the `off` list, and the effect's dependency array.

---

## 5. Game systems

### No-guess board generation
`generateBoard()` (`gameUtils.js:85`) runs a generate-and-verify loop: it produces a candidate via Fisher-Yates placement excluding the 3x3 zone around the first click, then asks `isBoardSolvable()` (`solverUtils.js:52`) whether the board can be cleared by pure logic. Up to 50 attempts; if none is solvable it returns the first candidate. The solver applies (1) single-cell deduction and (2) subset reduction over overlapping neighborhoods, iterating until no progress.

Boards are generated lazily on the **first click**, guarded by a Redis `SET NX` lock; a losing racer polls up to 5×100ms for the winner's board.

### Co-op flow
Create room → board is an empty grid → first click generates mines → `reveal()` flood-fills → `updateCells` broadcast to the room → `checkWin` auto-flags remaining mines and emits `gameWon`. Hitting a mine sets `gameOver` for everyone and names the player who hit it.

### PVP flow
Create room with `mode: 'pvp'` (creator becomes `hostSocket`) → second player joins (a third gets `pvpRoomFull`) → both receive `pvpRoomReady` → **host** emits `startPvpGame` → each player gets their own empty board and a `pvpPlayerIndex` (0/1) → each player's first click generates *their own* board → progress is broadcast to the opponent as a percentage → first to clear wins (guarded by `winner_lock`). A player who hits a mine can `resetMyBoard` and keep racing. The host can trigger `pvpRematch`. Disconnecting mid-game hands the win to the opponent.

> **Boards are not shared in PVP.** Each player's board is generated independently on their own first click, so the two races are over different mine layouts. `generateSeededBoard()` and the `sharedBoardSeed` room field exist for shared boards but are not wired up.

### Chording
Both mouse buttons pressed together, or the middle button. `Cell.tsx` writes `leftClick`/`rightClick`/`r`/`c` into the store; `Grid.tsx:119` watches for both being true and calls `chordCell(r, c)`; `bothPressed` suppresses the open/flag that would otherwise fire on mouse-up. The server opens all unflagged neighbors when the flag count matches the cell's number.

### Hover presence (co-op only)
`Cell` `onMouseEnter` → throttled 100ms → `cellHover` → server broadcasts `playerHoverUpdate` to everyone else → each client colors the cell using a hash of the socket id. Suppressed in PVP (`server.js:251`).

### Mobile flag mode
`isChecked` toggles tap-to-open vs tap-to-flag. `Grid` renders a separate mobile tree below the `xl` breakpoint; `Cell` renders both a `hideFrom="xl"` and a `hideBelow="xl"` hit area.

---

## 6. Development

```bash
npm install                # frontend deps (repo root)
npm --prefix server install   # backend deps
npm run dev:all            # starts local Redis if needed, then server (:3001) + Next (:3000)
npm test                   # server test suite (Jest) — proxies to `npm --prefix server test`
npm run lint
```

Local Redis is expected on `127.0.0.1:6379`; `scripts/ensure-redis.js` will try to start it. The server reads `DB_PASS`, `HOST`, `REDIS_PORT` from `server/.env` (gitignored) and falls back to localhost defaults.

**Tests** live in `server/tests/` and cover the pure layer only: board generation, the solvability engine, and `checkWin` with `io`/Redis mocked. There are no client tests.

---

## 7. Known issues and gotchas

These are real, currently unfixed, and worth knowing before changing related code.

1. **Errors are broadcast to the whole room.** `joinRoomError` (`server.js:85`) and `roomDoesNotExistError` (`server.js:152`, `:161`) go to `io.to(room)`. Because the client's `roomDoesNotExistError` handler calls `leaveRoom()`, one client with stale state ejects everyone.
2. **PVP boards differ per player** (see §5).
3. **Scoring differs per mode.** Co-op awards +1 per click regardless of cascade size and nothing on the board-initializing click (`game/coop.js`); PVP awards +1 per revealed cell (`game/pvp.js`).
4. **Stale room state on win checks.** `openCell` re-reads room state before `checkWin`; `chordCell` and `toggleFlag` pass their pre-reveal snapshot.
5. **Missing `pvpPlayerIndex` is handled inconsistently** — `openCellPvp` bails out, `chordCellPvp`/`toggleFlagPvp` default to index 0 and would mutate player 1's board.
6. **`boardUpdate` forces difficulty to "Medium"** on the client (`page.tsx:123`), regardless of the room's actual difficulty.
7. **`socket.off(event)` removes all handlers for that event**, not just this component's.
8. **Two Procfiles.** `/Procfile` (`cd server && node server.js`, paired with `heroku-postbuild`) and `/server/Procfile` (`node server.js`, paired with the `git subtree push --prefix server heroku main` deploy). Confirm which one Heroku actually uses before touching either.
9. **Server deps are declared twice** — in the root `package.json` and in `server/package.json`, with separate lockfiles.

*Fixed, kept here so it isn't reintroduced:* the `gameUtils` ⇄ `playerUtils` require cycle that silently broke co-op score resets — see the note in §3.

## 8. Single sources of truth (and where they aren't)

| Concept | Where it lives | Duplicates to keep in sync |
|---|---|---|
| Difficulty presets | `lib/difficultyConfig.tsx` | defaults `16,16,40` also hardcoded in `app/store.tsx:144`, `app/page.tsx:96`, `components/Landing.tsx:92` |
| Board size/mine rules | `server/validation.js` | client copy with *different* limits in `components/Landing.tsx:71-85` |
| Socket event names | nowhere — string literals on both sides | `app/page.tsx`, `server/server.js`, `server/utils/*`, `server/controllers/pvpController.js` |
| Redis key names | nowhere — inline template strings | `server.js`, `game/coop.js`, `game/pvp.js`, `gameUtils.js`, `playerUtils.js`, `pvpController.js` (PVP's per-player field names are at least centralized in `game/pvp.js` `playerKeys()`) |
| CORS origins | `server/utils/initializeClient.js` | listed twice in that same file (Express middleware + Socket.io config) |
| Backend URL | `lib/initSocket.js:3-5` | hardcoded per `NODE_ENV`, not env-driven |
| Cell reveal (flood fill) | still duplicated | `game/coop.js` `reveal()` and `game/pvp.js` `reveal()` remain near-identical — unifying them is the next planned step |
| Neighbor enumeration | `domain/board.js` `getAdjacentCells()` | plus `solverUtils.js:10` (`getAdjacentCoords`) and inline loops in `gameUtils.js:56` and `:250` |
| Board rendering | `components/Grid.tsx` | desktop tree `:149-361` and mobile tree `:363-520` render the board independently |
