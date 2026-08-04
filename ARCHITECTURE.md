# Minesweeper Co-op — Architecture

Real-time multiplayer Minesweeper with two modes: **co-op** (everyone shares one board) and **PvP** (two players race separate boards).

- **Frontend**: Next.js 14 App Router, React 18, TypeScript, Zustand, Tailwind, and an in-repo design system (`components/ds/`) built on design tokens. No UI component library. Deployed on Vercel.
- **Backend**: Node + Express + Socket.io, CommonJS, state in Redis. Deployed on Heroku as a *separate* package (`/server`).
- The two halves share no code today; the socket protocol is the only contract, and it is untyped on both sides.

---

## 1. Repository layout

```
app/                      Next.js App Router (client-side app; no server components, no API routes)
  page.tsx                "Home" — picks Landing, Grid or DailyChallenge; owns the top-level dialogs
  store.ts                Re-exports the store from state/ (keeps the @/app/store path)
  layout.tsx              Metadata/SEO, fonts, global stylesheets, Footer
  tokens.css              Design tokens: palette -> semantic colour, type scale, spacing, motion
  ds/                     Component catalog at /ds (noindex); dev surface, not a player page
    contrast.ts           WCAG maths + the audited pairs the catalog measures live
    themes.ts             The palettes the catalog previews
  globals.css
state/                    The Zustand store, one file per concern
  store.ts                Composes the slices
  types.ts                Cell, PlayerStats, PlayerHover
  gameSlice.ts            board, gameOver, gameWon, the run clock, the best-time verdict
  boardConfigSlice.ts     rows/cols/mines, board size, difficulty, mode
  roomSlice.ts            room, players, scores, hovers
  pvpSlice.ts             everything 1v1
  dailySlice.ts           everything daily-challenge; a SIBLING of room state, not a replacement
  inputSlice.ts           pointer state for chording and mobile flag mode
hooks/
  useSocket.ts            Socket lifecycle (create on mount, disconnect on unmount)
  useSocketEvents.ts      Registers a handler table; derives its own cleanup
  useGameEvents.ts        The server -> client handler table: co-op + PVP + daily
  useGameActions.ts       Every client -> server emit
  useGameStats.ts         Remaining flags, cleared counts and PVP progress percentages
  useBestTime.ts          This browser's record for the board in play/selected (reads after mount)
components/
  Grid.tsx                Layout only: one board, two control arrangements
  DailyChallenge.tsx      The daily view; reuses gameSlice's board (see §5)
  ThemeCards.tsx          Palette switcher (mounted by /settings)
  dialogs/
    GameDialogs.tsx       End-of-game summary, room errors and PVP outcome dialogs
    DailyDialogs.tsx      Daily-challenge outcome, leaderboard and share dialogs
  game/                   Shared pieces used by both layouts
    Board.tsx             The grid of cells; publishes --board-cols for the fit maths
    CursorLayer.tsx       Remote co-op cursors, positioned from measured cell geometry
    StatusBanner.tsx      PVP lobby states and win/loss badges
    ProgressBar.tsx       One PVP progress bar
    ScoreTable.tsx        Co-op leaderboard
    FlagCounter.tsx       Mines remaining
    Timer.tsx             The run clock, ticking locally from a server timestamp
    GameSummary.tsx       End-of-game numbers; reads co-op vs PVP differently
    BestTimeNote.tsx      Your record for this board, and whether this run beat it
    BestForBoard.tsx      The same record on the landing page, before you play
    RoomPanel.tsx         Room code, copy-link, and the invite prompt when you are alone
    Cell.tsx              One cell: mouse handling, hover highlight, memoized
    board.module.css      Board and cell styles, incl. the viewport-fit cell sizing
  Landing.tsx             Front page: layout and composition only
  landing/                Its pieces, each owning its own form state
    AnnouncementBanner.tsx  The dismissable strip; owns its own visibility
    JoinRoomForm.tsx        Join field + the ?room= join-link effect that fills it
    CreateRoomForm.tsx      Room code, and the mode/size/difficulty rows
    CustomBoardDialog.tsx   Hand-rolled dimensions, with the derived mine preview
    CustomBoardErrorDialog.tsx  Out-of-range dimensions
    NameDialog.tsx          "Enter your Name", shared by create and join
  Footer.tsx              GitHub link, how-to-play and theme dialogs
components/ds/            The design system. Import via its index barrel
  pixel.module.css        The two border treatments: notched (controls), boxed (regions)
  icons.tsx               16x16 sprites stored as editable character grids
  cx.ts, pointer.ts       Class joiner; the shared pixel-cursor class
shared/                   Imported by BOTH halves; viable because the whole repo deploys (§6)
  boardConfig.js          Board sizes, difficulty densities, limits, validity rule, DAILY_PRESET
  events.js               Every socket event name, both directions (frozen, so TS infers literals)
  socketPayloads.ts       Payload shapes; binds the CLIENT only (the server is CommonJS)
lib/
  dialogs.ts              Every dialog id, plus openDialog/closeDialog
  initSocket.ts           socket.io-client factory (URL from NEXT_PUBLIC_SOCKET_URL)
  session.ts              Per-tab session id (sessionStorage) used for reconnect
  throttle.ts             throttle() + generateColorFromId() for hover colors
  confetti.ts             canvas-confetti wrapper
  motion.ts               prefersReducedMotion() and the cascade banding
  theme.ts                Palettes, persistence, the no-flash script, cursor ramp
  gameClock.ts            elapsedSeconds/formatClock — the one reading of the run clock
  bestTimes.ts            Personal bests in localStorage, keyed by board dimensions
  roomLink.ts             Builds a shareable join URL
  dailyIdentity.ts        The opaque per-browser token a daily attempt is filed under
  dailyShare.ts           The shareable result text
test/
  setup.ts                Vitest setup; DOM cleanup, guarded so Node-only tests skip it
types/
  canvas-confetti.d.ts    Local typings for a dependency that ships none
scripts/
  ensure-redis.js         Dev helper: starts local Redis if port 6379 is closed
  write-version.js        Stamps the build version
  ui-smoke/               Headless-Chrome smoke test for the client (npm run test:ui)
  verify-deploy/          Plays a real game against the DEPLOYED backend (npm run verify:deploy)
server/                   Separate npm package (own package.json, lockfile, node_modules)
  server.js               Every socket.on handler + isValid() room/membership guard
  config.js               Env-resolved settings: allowed CORS origins, PORT
  validation.js           Pure socket payload validators (limits, coords, membership)
  data/
    keys.js               Every Redis key and TTL. Nothing else builds a key by hand
    locks.js              SET NX lease mechanics, shared by every repo that takes one
    roomRepo.js           All room reads/writes, incl. board JSON, players list and locks
    playerRepo.js         All player reads/writes
    sessionRepo.js        Browser sessions, mapping a stable id onto the current socket
    dailyRepo.js          The day's board template, attempts and leaderboard
  domain/                 Pure. No Redis, no io, no config — enforced by tests/layering.test.js
    board.js              Board primitives (createEmptyBoard, getAdjacentCells,
                          revealFrom, projectBoard/projectCells)
    clock.js              Run-clock reads (timestamps in, payload out)
    pvpPlayer.js          Which of a room's two boards a socket owns. One rule, no fallback
    boardGen.js           Board generation and the no-guess retry loop; `rng` is injectable
    solverUtils.js        No-guess solvability engine
    seededRandom.js       Deterministic RNG for the daily board
  game/
    index.js              Mode dispatch — the ONLY place that decides co-op vs PVP
    coop.js               Shared-board cell actions, broadcast to the room
    pvp.js                Per-player cell actions, emitted to one socket
    daily.js              Seeded board generation + the daily cell actions
  controllers/            Lifecycle flows. Each one answers a socket event
    pvpController.js      PVP lifecycle: startPvpGame / resetMyBoard / pvpRematch
    sessionController.js  Offers a returning browser its room back; forgets it on a real leave
    dailyController.js    Daily lifecycle: start, submit, leaderboard
  utils/                  Services over the repos and io, plus the singletons themselves
    gameUtils.js          Room lifecycle: checkWin, createRoom, resetGame
    playerUtils.js        Join/leave, score stats, PVP disconnect handling
    pvpForfeit.js         The reconnect grace period before a disconnect forfeits a race
    initializeClient.js   Express app + io singleton + CORS
    initializeRedisClient.js  Redis singleton (exported as a Promise)
  tests/                  Jest (`npm test` from /server, or `npm test` at the repo root)
```

---

## 2. Client architecture

### Component tree

```
layout.tsx → tokens.css + globals.css → page.tsx + Footer + Analytics
page.tsx ──┬→ DailyChallenge (when dailyActive)   → Cell[][]
           ├→ Landing        (when !playerJoined)
           └→ Grid           (when playerJoined)  → Cell[][]
```

The three are mutually exclusive, which is what lets the daily view reuse
`gameSlice`'s board and keeps exactly one board mounted (trap #3).

`page.tsx` drills 11 callbacks from `useGameActions` into `Grid`, which drills 4 into each `Cell`. Everything else flows through the Zustand store.

Socket wiring lives in `hooks/`. Handlers and actions read and write the store
through `useMinesweeperStore.getState()` rather than subscribing, so they cause
no re-renders and the callbacks stay referentially stable for the life of a
socket. `page.tsx` itself subscribes only to `playerJoined` and `gameOverName`.

### State (`state/`, re-exported by `app/store.ts`)

One store, assembled from eight slices:

| Group | Fields |
|---|---|
| Game | `board`, `gameOver`, `gameWon`, `startedAt`, `endedAt`, `bestTimeResult` |
| Board config | `numRows`, `numCols`, `numMines`, `boardSize`, `difficulty`, `mode` |
| Room/player | `room`, `playerJoined`, `name`, `playerStatsInRoom`, `gameOverName`, `playerHovers` |
| PVP | `pvpStarted`, `pvpOpponentName`, `pvpOpponentStatus`, `pvpWinner`, `pvpRoomReady`, `pvpIsHost`, `pvpOpponentProgress`, `pvpTotalSafeCells` |
| Daily | `dailyActive`, `dailyDate`, `dailyStatus`, `dailyElapsedMs`, `dailyRank`, `dailyLeaderboard`, … |
| Mouse/UI | `isChecked` (mobile click-vs-flag), `r`, `c`, `leftClick`, `rightClick`, `bothPressed` |
| Settings | `settings` (the lib/settings.ts blob: theme, and each later PRD phase's keys), `settingsHydrated` |

Each row above is one slice file. Slices are plain creators sharing one `set`, so
a slice can write another's fields where that is genuinely the behaviour —
`resetPvpState` clears `gameOver`/`gameWon` because a rematch must.

Every field has its own setter, plus `resetPvpState()` (which also clears `gameOver`/`gameWon`).

**The daily challenge borrows `gameSlice`'s `board` rather than holding its own.**
The daily view and the room view are mutually exclusive — `page.tsx` shows one or
the other — so one board field costs nothing and keeps the "board mounts exactly
once" invariant intact. `dailyActive` is what decides which view is showing, and
it is also why the `sessionResume` handler bails when it is set: a resume offer
landing while the player is on the daily must not quietly put them back in a
room.

**Subscription note:** every consumer subscribes with per-field selectors —
`page.tsx` to just `playerJoined` and `gameOverName`, `Grid.tsx` to the fields it
renders, and `Cell.tsx` to its own cell's hover. Nothing calls
`useMinesweeperStore()` bare any more, so a remote hover update no longer
re-renders the page and the whole grid. Keep it that way when adding state.

---

## 3. Server architecture

### Module dependencies

```
server.js ─→ initializeClient (io) , validation , playerUtils , gameUtils , game ,
             data/* , pvpController , sessionController , dailyController
game/index ─→ game/coop , game/pvp , domain/pvpPlayer , data/*   ← co-op vs PVP only; daily is not dispatched here
game/coop ─→ gameUtils , playerUtils , domain/{board,clock,boardGen} , data/* , io
game/pvp ─→ playerUtils , domain/{board,clock,pvpPlayer} , data/* , io
game/daily ─→ gameUtils , domain/{board,boardGen,solverUtils,seededRandom} , data/dailyRepo , io
pvpController ─→ gameUtils , playerUtils , validation , domain/{board,clock,boardGen,pvpPlayer} , data/*
sessionController ─→ data/{roomRepo,sessionRepo}
dailyController ─→ game/daily , domain/board , validation , data/dailyRepo
gameUtils ─→ playerUtils , domain/{board,clock,boardGen} , data/roomRepo , io
playerUtils ─→ utils/pvpForfeit , domain/{board,clock} , data/* , io
utils/pvpForfeit ─→ domain/clock , data/* , config , io
data/*Repo ─→ data/keys , data/locks , initializeRedisClient
data/locks ─→ data/keys , initializeRedisClient
domain/* ─→ only other domain/*
data/keys , config , validation ─→ (nothing)
```

> `gameUtils` and `playerUtils` used to require each other, which meant `gameUtils`
> captured `undefined` for `resetPlayerScores`/`updatePlayerStatsInRoom` and
> `resetGame()` threw silently. `domain/board.js` exists to give both a shared,
> dependency-free source for board helpers. **Keep it dependency-free, and don't
> reintroduce imports between `gameUtils` and `playerUtils`** —
> `tests/resetGame.test.js` guards this and depends on its own require order.
> `domain/clock.js` and `domain/boardGen.js` were added on the same terms.

**None of this is on the honour system any more.** `tests/layering.test.js`
derives the graph from the source and fails on a cycle, on any module importing
a higher layer, or on anything in `domain/` reaching outside it. Reintroducing
the `gameUtils` ⇄ `playerUtils` cycle fails it by name.

The layers, lowest first — a module may import its own layer or below:

| | |
|---|---|
| 0 | `config.js`, `validation.js` — leaves, import nothing |
| 1 | `initializeClient`, `initializeRedisClient` — the io and Redis singletons |
| 2 | `domain/` — pure logic |
| 3 | `data/` — repositories |
| 4 | `utils/` — services over repos + io |
| 5 | `game/` — per-mode cell actions |
| 6 | `controllers/` — lifecycle flows |
| 7 | `server.js` — socket wiring |

`pvpForfeit` used to sit in `controllers/`, which made `playerUtils` (a util)
import a controller. It handles no socket event — it is a timer over the repos —
so it was misfiled rather than mis-wired, and moving it to `utils/` removed the
inversion without inventing a layer.

`redisClient` is imported only by `data/`. `io` is still a module-scope singleton imported wherever something emits, so handlers need it mocked to be tested (see `server/tests/setup/mockInfra.js`, which mocks both globally).

### Request path

1. Client emits → handler in `server.js`
2. Payload validation via `server/validation.js` (pure, no I/O), then `isValid(room)` — room exists, player exists, player is in the room's `players` array
3. `game/index.js` loads the room hash from Redis and **dispatches on `roomState.mode`** to `game/coop.js` or `game/pvp.js`
4. An action lock is taken — the room's for co-op, that player's for PVP — and the room hash is **read again under it**. The snapshot from step 3 predates the lock, so it is only good for choosing the mode and (in PVP) the lock key. That fresh snapshot is what the mode module gets
5. Board JSON is mutated and written back, and the lock released
6. The result is **projected** (see §3.1) and emitted via `io.to(room)` (co-op) or `io.to(socketId)` (PVP)

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

Defined in `server/data/keys.js`; all access goes through the repos in
`server/data`. Nothing outside that directory should build a key or touch the
Redis client directly.

**`room:<roomCode>`** — TTL 24h
`mode` `noGuess` `gameOver` `gameWon` `gameOverName` `initialized` `players` (JSON array of socket ids) `numRows` `numCols` `numMines` `board` (co-op only, JSON) `startedAt` `endedAt`

`startedAt`/`endedAt` are the run clock, as epoch milliseconds. They are
timestamps rather than an elapsed count on purpose — see §5.

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

**`daily:<date>:board`** — TTL 48h
The day's generated template: `board` (JSON) `seed` `numRows` `numCols` `numMines` `openedCells` `startRow` `startCol`. One per UTC date, shared by every player.

**`daily:<date>:attempt:<token>`** — TTL 48h
One player's attempt, filed under an opaque browser token rather than a socket
id, so it survives a reconnect. Terminal statuses (`failed`,
`won_pending_submit`, `completed`) are defined once in `dailyRepo` because both
`game/daily.js` and `controllers/dailyController.js` gate on them.

**`daily:<date>:leaderboard`** — TTL 48h
Sorted set of completion times.

**`matchmaking:queue`** — TTL 1h, refreshed on every enqueue
Hash: field = socket id, value = JSON `{name, sessionId, queuedAt}`. **One
queue, not one per board configuration** — see §5. An entry older than two
minutes is treated as dead and pruned on the way past, so a socket that vanished
without its cleanup running cannot sit at the head of the queue forever.

**Locks** — `SET NX EX`
`init_lock:<room>` (co-op first click, 10s) · `winner_lock:<room>` (PVP win
claim, 10s) · `join_lock:<room>` (PVP capacity check + join, one decision) ·
`matchmaking:lock` (one pairing decision at a time) · `daily:<date>:gen_lock`
(serialises board generation — an optimisation, not a correctness requirement,
10s) · `daily:<date>:start_lock:<token>` (10s) · `action_lock:<room>` (one co-op
move at a time, 5s) · `action_lock:<room>:p<N>` (one move at a time from PVP
player N, 5s) · `daily:<date>:action_lock:<token>` (one move at a time on one
attempt, 5s)

The action locks carry the shorter lease because *every* move takes one, so a
process that dies holding one blocks that board for its lease. They are scoped as
tightly as the shared state allows: co-op players genuinely share one board, but
the PVP key is per **player** and the daily key per **attempt**, because those
own separate fields and must never wait on each other. The mechanics are one
implementation in `data/locks.js`; each repo only decides which key.

Players are keyed by socket id, so a reconnect is a new player row. That is why
a returning browser is identified by its **session** (rooms) or its **daily
token** (the daily challenge) instead.

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
| `findMatch` | `{name}` — no room; there is not one yet | `matchmakingController.js` |
| `cancelMatch` | — | `matchmakingController.js` |
| `startDaily` | `{dailyAttemptToken}` — no date; the server uses its own UTC day | `dailyController.js` |
| `dailyOpenCell` / `dailyChordCell` / `dailyToggleFlag` | `{dailyAttemptToken, date, row, col}` | `game/daily.js` |
| `submitDailyScore` | `{dailyAttemptToken, date, name}` | `dailyController.js` |
| `getDailyLeaderboard` | `{date}` | `dailyController.js` |

Daily actions carry a **token**, not a room: the daily challenge is not a room
(see §5), so there is no membership to check and nothing to broadcast to. They
carry the `date` the attempt started under too, echoed back from `dailyStarted`
rather than recomputed per event — only `startDaily` has no date to send, and it
takes the server's. An attempt therefore stays pinned to its own day across UTC
midnight, on both halves: `lib/dailyIdentity.ts` holds the token still for the
same reason.

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

### Server → Client — matchmaking

| Event | Payload |
|---|---|
| `matchSearching` | — (queued, nobody to pair with yet) |
| `matchCancelled` | — |
| `matchError` | — (ends the wait rather than spinning forever) |

There is deliberately **no `matchFound`**. A pairing arrives as the ordinary
`joinRoomSuccess` + `pvpRoomReady` a hand-made PVP room sends, so the client has
one code path for both — see §5.

### Server → Client — daily challenge

| Event | Payload |
|---|---|
| `dailyStarted` | the day's board, date, status and totals |
| `dailyAlreadyAttempted` | — (one attempt per browser per day) |
| `dailyUpdateCells` / `dailyBoardUpdate` | same shapes as their co-op counterparts |
| `dailyGameOver` / `dailyWon` | the attempt's outcome |
| `dailyScoreSubmitted` | `{rank, totalEntries}` |
| `dailyLeaderboardUpdate` | the day's times |

Every daily event goes to ONE socket. Nothing about the daily challenge is
broadcast, because no two players share state in it.

### Shared

| Event | Payload |
|---|---|
| `gameClock` | `{startedAt, endedAt}` — epoch ms, either may be null |
| `sessionResume` | `{room, name}` — sent on connect to a browser whose room is still alive |

Shapes are typed in `shared/socketPayloads.ts` (`ServerToClientEvents`).

Event names come from `shared/events.js` and the payload shapes above are typed
in `shared/socketPayloads.ts`, so the tables in this section describe the
protocol but are no longer the only record of it.

`server/tests/events.test.js` enforces that both halves use the constants, that
the client's table covers exactly what the server sends, that the event objects
stay frozen, and that every event has a declared payload type.

**Why frozen.** TypeScript widens a plain object's string properties to `string`,
which is too wide to look a payload up by — the handler table would degrade to
`any` with nothing to see. Through `Object.freeze` it infers the literal
`'boardUpdate'` instead. That inference is why adding an event touches four
files rather than five: there used to be a hand-written `shared/events.d.ts`
restating all 55 names, plus a test to stop the two drifting.

The remaining four are close to irreducible. The name and the payload could in
principle merge into one TypeScript file, but `shared/` is plain JS precisely so
the CommonJS server can `require` it with no build step — and that is what makes
the whole-repo Heroku deploy work (§6). Trading that for one fewer file to edit
is not a good trade.

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
Create room with `mode: 'pvp'` (creator becomes `hostSocket`) → second player joins (a third gets `pvpRoomFull`) → both receive `pvpRoomReady` → **host** emits `startPvpGame`, which builds ONE board and gives it to both players → progress is broadcast to the opponent as a percentage → first to clear wins (guarded by `winner_lock`). A player who hits a mine can `resetMyBoard` and keep racing. The host can trigger `pvpRematch`.

Disconnecting mid-game does **not** immediately hand the win over. It starts a
grace period (`utils/pvpForfeit.js`); the forfeit only lands if the player
does not come back before it expires, which is what makes a reload survivable
rather than fatal. Rejoining cancels it implicitly, by making the room whole
again.

### Quick match

One button pairs two strangers into a PVP room with no shared room code.

**It builds a room and nothing else.** Once both players are in it they are in
an ordinary PVP room — the lobby, `startPvpGame`, the shared board, the forfeit
grace period, rematch and reconnect all run untouched, and none of them can tell
a matched room from a hand-made one. That is why a pairing is announced as the
same `joinRoomSuccess` + `pvpRoomReady` a hand-made room sends, and why there is
no `matchFound` event to keep in step. The room code is minted as `QM-XXXXXX`
from an unambiguous alphabet and collision-checked against live rooms — room
codes are arbitrary user text, so nothing stops a player creating `QM-ABC123` by
hand.

**One queue, on one fixed board** (`DEFAULT_PRESET`, 16x16/40). Queueing per
size and difficulty would be twelve queues, and twelve queues at this traffic
level are twelve empty ones; liquidity is what makes the button work at all.
Whoever waited longer is host, because PVP's host is whoever presses Start.

**"Is anyone waiting, and if so take them" is one decision**, held under
`matchmaking:lock` exactly like the PVP capacity check. Unlocked, two players
arriving together both read an empty queue and both sit down in it, each waiting
for the other — a deadlock that resolves only when a third player shows up. Only
the decision is locked; building the room happens outside it, since the partner
is already out of the queue by then and unreachable by anyone else.

Three ways a queue entry goes bad, and all three look identical in the hash: the
socket dropped without its cleanup running, the player joined a room some other
way while queued, or the entry is old enough that neither answer can be trusted.
All three are pruned on the way past — a player record existing *is* being in a
room. `server/tests/matchmaking.test.js` drives overlapping searches through a
Redis fake that resolves on the event loop, for the same reason
`coopConcurrency.test.js` does.

### Daily challenge

One seeded board per UTC date, identical for everyone, ranked by
server-authoritative completion time.

**It is deliberately not a room.** A room is a shared, mutable board with a
membership list and a broadcast channel; the daily challenge is the opposite —
every player gets their own copy of one immutable template, nobody sees anyone
else's progress, and there is nothing to broadcast. Modelling it as a room would
mean either one room per player (a membership list of one, a lock nobody
contends, a broadcast to a single socket) or one shared room (where one player's
click would reveal cells on everyone's board). So it has its own keys
(`daily:<date>:*`), its own repo, and its own events, all addressed by **date +
an opaque browser token** rather than room code + socket id. The token is what
lets an attempt survive a reconnect.

**The board is generated once per day, and picked for difficulty rather than
just solvability.** `game/daily.js` seeds a deterministic RNG from the date,
draws candidates until it has `DAILY_CANDIDATE_POOL_SIZE` (30) no-guess-solvable
ones, and keeps the *hardest* — the one that needed the most subset/overlap
reasoning rather than easy single-cell deductions, scored by `solveWithStats`.
The ordinary generator stops at the first solvable board; this is what turns
"solvable" into "hard" without changing what solvable means. Generation is
serialised by a lock, but only as an optimisation — two servers generating the
same seed produce the same board.

One attempt per browser per day, in the terminal statuses defined once in
`dailyRepo` (`failed`, `won_pending_submit`, `completed`).

### The run clock

The server stores `startedAt`/`endedAt` on the room and the client ticks locally
from `startedAt`. Timestamps rather than an elapsed count means no per-second
event, every co-op player reads the same clock, and a player arriving mid-run
joins the clock already running instead of starting a second one.

The clock starts on the **first reveal**, not on room creation — a room can sit
open for minutes before anyone clicks. A co-op run stops for the whole room. A
PVP race shares a start (both players race the same board from the same moment,
so it is room state) but its finishes are per-player and are sent to that socket
only: writing an end to room state would stop the opponent's clock while they
were still playing.

`lib/gameClock.ts` is the one place that turns those timestamps into a reading,
so the live timer and the end-of-game summary cannot disagree.

### Personal best times

Kept in `localStorage`, never sent to the server: there are no accounts to hang
a real leaderboard off, and a server-side table nobody can be authenticated
against would rank whoever edited a socket payload last. (The daily challenge
*does* have a server leaderboard — it can afford one because the board is fixed
and the time is server-authoritative.)

Records are keyed by the board's **dimensions and mine count**, not by its
size/difficulty labels: `setDimensions` gives a joining player the room's
numbers and leaves the labels at whatever they last picked, so a label-keyed
record would file a joiner's win under a board they never played. Each record
also stores how many players were in the room, because clearing a board with
three friends is a real result but not the same one.

Only a cleared board counts. A loss has a time but is not a completion, and
winning because an opponent disconnected is not one either.

### Rejoining after a reload

Player records are keyed by socket id, so a reload destroys one. The **session**
(`session:<id>`, with the id in sessionStorage) outlives it and remembers the
room, so on connect the server offers the browser its room back and the client
answers with an ordinary `joinRoom` — a resume therefore runs the same validated
path a manual join does, rather than a parallel one that could drift.

The distinction that makes it safe: leaving on purpose and dropping off the
network reach the same `removePlayer` and are otherwise indistinguishable. Only
the deliberate exit calls `sessionController.forgetRoom`, so only the accident
is ever resumed.

PVP needs more than co-op does, because the room addresses each racer's board by
socket id: the slot is repointed at the new socket and `pvpPlayerIndex` is
rebuilt **from the room**, since the old player record is already gone.

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
Three gestures, all on an opened number. Both mouse buttons pressed together: `Cell.tsx` writes `leftClick`/`rightClick`/`r`/`c` into the store, `useChording` (mounted by `Grid.tsx`) watches for both being true and calls `chordCell(r, c)`, and `bothPressed` suppresses the open/flag that would otherwise fire on mouse-up. The middle button, straight from `Cell`'s mousedown. And the **secondary click** — right button, or the two-finger tap and ctrl-click a trackpad maps to it — fired from `Cell`'s mouse-**up**, since macOS raises `contextmenu` on mousedown and a right-then-left chord would otherwise fire twice. That third one exists because a trackpad has neither a second button nor a middle one, so the other two gestures are unreachable on one; it costs nothing because flagging an already-open cell is a no-op the server drops anyway. The server opens all unflagged neighbors when the flag count matches the cell's number.

### Hover presence (co-op only)
`Cell` `onMouseEnter` → throttled 100ms → `cellHover` → server broadcasts `playerHoverUpdate` to everyone else → each client colors the cell using a hash of the socket id. Suppressed in PVP (`server.js:251`).

### Accounts and the auth bridge

Sign-in is OAuth-only (Google, GitHub) via Auth.js v4 in the Next app — see
`USER_PROFILES_PRD.md` for the feature plan. The parts worth knowing:

**Two tokens, on purpose.** NextAuth's session cookie is an encrypted JWE bound
to the Vercel deploy; the game server neither can nor should read it. When the
client needs to prove itself to Heroku it asks `/api/socket-token` (with
`/api/auth/*`, the app's first API routes — everything game-shaped still speaks
the socket) for a **bridge token**: a 1-hour HS256 JWT carrying just the OAuth
identity, signed with `AUTH_BRIDGE_SECRET`, which both deploys hold.
`lib/authBridge.ts` caches it and `lib/initSocket.ts` presents it on the
socket handshake — `auth` is a *function* so every reconnect re-reads it —
plus `lib/profileApi.ts` sends it as a bearer on the REST calls.

**The server's two transports have opposite failure policies.**
`server/utils/authToken.js` verifies (never throws);
`server/controllers/profileController.js` applies it twice: the socket path
resolves any failure — bad token, no `DATABASE_URL`, Postgres down — to
`socket.data.user = null`, an anonymous player, because auth being down must
never block a game. The REST path (`GET/PUT/DELETE /api/me`) answers honestly
with 401/503 instead, because account data is all it serves. OAuth sign-in and
sign-out are full-page redirects, so the socket always reconnects fresh with
the right token state; nothing reconciles mid-session.

**Stats are written by the game server, never sent by a client.** The four
terminal sites — co-op win (`gameUtils.checkWin`), co-op loss (`game/coop.js`),
a decided PVP race (`game/pvp.js`, winner and loser both; forfeits record
nothing), and a finished daily attempt (`game/daily.js`) — call
`utils/statsRecorder`, which resolves each socket back to `socket.data.user`
and fires `statsRepo.recordResult` best-effort: anonymous players are skipped
silently and a Postgres failure is logged and dropped, never allowed to delay
a game-over emit. Each result is ONE transaction (the result row, the
recent-window prune, the aggregates under `FOR UPDATE`, and a keep-if-faster
board best), so an aggregate can never disagree with its rows. The
day-streak maths lives in `domain/streak.js`, pure. `/profile` reads it all
via `GET /api/stats`; the only stats write endpoint is the guest best-times
import, keep-if-faster by construction. A signed-in daily submit stores the
ACCOUNT display name on the leaderboard.

**Users live in Postgres** (`server/data/userRepo.js`, the first
Postgres-backed repo) keyed by `(provider, provider_account_id)`, created on
first sight with one upserting statement. Email refreshes each sign-in;
`display_name` deliberately does not — renames made in the account menu must
survive. Deletion is a hard `DELETE`; tables added by later phases must declare
`ON DELETE CASCADE` against `users` so it stays the single deletion point.

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
npm run test:client        # client unit tests (Vitest): pure logic + component rendering
npm run test:ui            # client smoke test in headless Chrome (needs dev:all running)
                           # also runs in CI, as its own job with a redis service
npm run verify:deploy      # plays a real game against the DEPLOYED backend; not in CI
npm run lint
```

Local Redis is expected on `127.0.0.1:6379`; `scripts/ensure-redis.js` will try to start it.

**Postgres is optional.** It holds durable account data (users, settings, stats
— see `USER_PROFILES_PRD.md`); without `DATABASE_URL` the server logs one line
at boot and runs the whole game with account features off, so contributors not
touching profiles need no database. To work on account features locally: run a
Postgres, set `DATABASE_URL` in `server/.env`, and apply migrations with
`npm --prefix server run migrate`. On Heroku, migrations run in the `release`
phase (`scripts/run-migrations.js` via `/Procfile`) — after the build, before
new dynos boot, skipping harmlessly when no database is provisioned.

**Configuration.** Every variable has a working default, so an unset one keeps
the previous hardcoded behaviour. See `.env.example` and `server/.env.example`.

| Variable | Where | Default |
|---|---|---|
| `NEXT_PUBLIC_SOCKET_URL` | client | localhost:3001 in dev, the Heroku app in prod. Inlined at build time |
| `ALLOWED_ORIGINS` | server | comma-separated; falls back to localhost:3000 plus the deployed frontends |
| `PORT` | server | 3001 |
| `HOST`, `REDIS_PORT`, `DB_PASS` | server | local Redis with no auth |
| `DATABASE_URL` | server | unset — no Postgres, account features off |
| `AUTH_BRIDGE_SECRET` | both | unset — sign-in off; must be the SAME value on both deploys |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | client | unset — that provider's sign-in button absent |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | client | NextAuth's own session; required in production for sign-in |

**Tests.** Three layers, each answering something the others cannot:

- `server/tests/` — Jest over the server, with `io` and Redis mocked globally, so
  no test touches real infrastructure.
- `npm run test:client` — Vitest over the frontend. Pure logic runs in Node; a
  file that renders a component opts into a DOM with `// @vitest-environment
  jsdom` on its first line, so the fast majority never pays for one. Aimed at
  what fails *silently* — an accessible name that stops resolving, a dialog
  button that stops closing.
- `scripts/ui-smoke/` — headless Chrome against a real backend, for what jsdom
  cannot see. jsdom has no layout engine, and implements `<dialog>` without the
  part where submitting a `method="dialog"` form closes it. It also walks every
  palette and checks the WCAG audit, since contrast depends on resolved colours.

Appearance has no screenshot baselines on purpose. `app/tokens.test.ts` parses
the token file for what CSS fails silently on (a dangling `var()`, a theme
overriding a renamed token or reaching past the palette layer, a semantic token
holding a literal). The cross-theme contrast check is a ratchet over
`KNOWN_CONTRAST_FAILURES` — the most restricted palettes cannot meet AA
everywhere and remain themselves, so the suite guards against the set growing
rather than demanding it be empty.

`npm run verify:deploy` is the only check that touches the deployed stack. See
CLAUDE.md for what belongs in which layer.

---

## 8. Known issues and gotchas

These are real, currently unfixed, and worth knowing before changing related code.

1. **Heroku installs the whole frontend dependency tree and never uses it.** The root `npm install` pulls Next, React and the rest onto a dyno that only runs `cd server && node server.js`; `heroku-postbuild` replaces the `build` script, so the frontend is never built there. Wasted build time and slug size, not a correctness problem.


*Fixed, kept here so they aren't reintroduced:* the `gameUtils` ⇄ `playerUtils`
require cycle that silently broke co-op score resets (see §3); the stale room
snapshot that let a chord into a mine also announce a win; the unserialised co-op
and PVP read-modify-writes (below), and the daily challenge's, which landed in
parallel with them and was fixed on the same terms; the `pvpPlayerIndex || '0'` fallback that let
an unassigned socket write another player's board — caught first in `pvp.js`'s
cell actions, then again in `resetMyBoard`, where the surviving copy also chose
the action lock key, so a stranger both reset and locked PLAYER ONE's board.
Deriving the index in three places is what let two of them disagree, so
`domain/pvpPlayer.js` is now the single rule and returns null rather than
defaulting; the per-mode scoring split (below); and the duplicate
`server/Procfile`, which said `web: node server.js` while the deploy ran the
root one's `cd server && node server.js`. All but the Procfile are covered by
tests; that one is covered by there being only one file to get wrong.

**Co-op moves are serialised per room.** The board is one Redis hash field, so
every move rewrites all of it. Two moves that overlapped both read before either
wrote, and the second `setBoard` erased the first player's reveals — with no
error, and with both sets of `updateCells` already delivered. The clients stayed
permanently ahead of the server, and since the server's board still held closed
safe cells, `checkWin` never fired: the board looked finished and the game simply
never ended. Reproduced at 320ms between moves, so it was not a stress-only
artifact. `game/index.js` now wraps the three co-op actions in
`roomRepo.withActionLock` and re-reads the room hash (and the player's score)
inside it — reading before the lock is the bug, not a shortcut.
`server/tests/coopConcurrency.test.js` drives real overlapping moves through
`game/index.js` against a Redis fake that resolves on the event loop; the shared
mock has no store behind it and cannot express staleness.

**PVP had the same bug, scoped per player**, and it decided races. Each of its
actions rewrites one player's whole board field, so two of that player's own
overlapping moves erased each other — leaving a closed safe cell they could
never reopen, so their board never completed and they could never win, handing
the race to their opponent with no error anywhere. `player1Progress` was lost the
same way, and since it is never recomputed from the board, the opponent's
progress bar stayed wrong for the rest of the race. The lock is keyed per
**player** (`withPvpActionLock`): the two boards are separate hash fields, so one
player's write never touched the other's, and serialising them against each other
would break the race itself. `resetMyBoard` takes that player's lock and
`pvpRematch` takes both, in index order — nothing takes them in any other order,
and a move only ever holds one, so there is no cycle to deadlock on.
`startPvpGame` needs none: it refuses to run once `pvpStarted` is `'true'`, and
no move runs until it is. Covered by `server/tests/pvpConcurrency.test.js`, whose
last two tests pin down that the two players stay independent.

`resetGame` takes the same lock, because it is a co-op board write like any
other. A move in flight when a reset landed used to write its board back on top
of the fresh one, leaving a room that claimed `initialized: 'false'` while
holding a played board — and the *next* click would then generate a second board
over it. Which of the two lands first is genuinely ambiguous and both outcomes
are fine; that either is complete before the other starts is the part that
isn't. Note the lock is not reentrant, so nothing already holding it may call
`resetGame`; the RESET_GAME handler in `server.js` is the only caller.

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
| Join-link query param | `lib/roomLink.ts` (`ROOM_QUERY_PARAM`, `buildJoinUrl`) | — |
| Cell reveal (flood fill) | `domain/board.js` `revealFrom()` | each mode wraps it to react to a mine: co-op ends the room's game, PVP ends only that player's |
| Neighbor enumeration | `domain/board.js` `getAdjacentCells()` | plus `solverUtils.js:10` (`getAdjacentCoords`) and inline loops in `gameUtils.js:56` and `:250` |
| Board rendering | `components/game/Board.tsx` | mounted once; the layouts sit either side of it (trap #3) |
| The run clock's reading | `lib/gameClock.ts` | the live timer and the summary both use it, so they cannot disagree |
| Daily terminal statuses | `server/data/dailyRepo.js` (`TERMINAL_STATUSES`) | mirrored by name in `state/dailySlice.ts`'s `DailyStatus` |
| A board's identity for records | `lib/bestTimes.ts` (`boardKey`) | derived from dimensions + mines, never from the size/difficulty labels |
