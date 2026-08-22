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
  sprites.tsx             The mine and flag, one pair per seasonal palette; drawn the same way
  pixelArt.ts             The grid -> <rect> runs both of those share
  cx.ts, pointer.ts       Class joiner; the shared pixel-cursor class
shared/                   Imported by BOTH halves; viable because the whole repo deploys (§6)
  boardConfig.js          Board sizes, difficulty densities, limits, validity rule, DAILY_PRESET
  boardKeys.js            How a board record is identified: board + how many cleared it
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
  holidays.ts             The seasonal schedule: which palette the DATE picks, if any
  gameClock.ts            elapsedSeconds/formatClock — the one reading of the run clock
  bestTimes.ts            The GUEST copy of your bests (localStorage) + the shape both copies share
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
layout.tsx → tokens.css + globals.css → SpriteDefs + page.tsx + Footer + Analytics
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

**`shared/` is outside the graph, at every layer.** `importsOf` keeps only
paths under `server/`, so a require of `../../shared/*` is invisible to these
rules — which is what lets `domain/achievements.js` read the achievement
catalog and `domain/` stay "pure" at the same time. That is deliberate:
`shared/` is imported by both deployables and holds no I/O, so it is a leaf
like `config.js`. The cost is that the test can say nothing about it. A
`shared/` module that grew a Redis call, or a require back into `server/`,
would pass silently — so purity there is a review responsibility, not a
tested one.

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
| any, once that player's game is genuinely OVER | real | real | real |

Closed cells hide `nearbyMines` as well as `isMine` — the neighbour count of an
unopened cell is nearly as good as the answer, since it lets you solve the board
offline.

**Consequence for terminal states:** because clients are no longer told the
layout up front, the server must actively push a revealed board when a game
ends, or the UI would show a single detonated mine and nothing else. That is why
`coop.reveal` emits a revealed `boardUpdate` to the room on a loss, and
`checkWin` emits a revealed board on a win.

> **"Over" is per mode, and PVP is the odd one out.** A co-op loss ends the
> room's game and a daily attempt is one per day, so in both a detonation really
> is the end. A PVP detonation is not: `resetMyBoard` puts that racer back on
> the SAME shared layout to carry on racing. Revealing to them there was an
> answer key — die on the second click, read every mine, reset, clear it with
> perfect knowledge, take the win off an opponent playing it straight. Found by
> playing it out against a real server.
>
> So a PVP board is revealed only once the RACE is decided — `revealToLoser`
> when someone wins, and `restorePvpRacer` gated on the same condition rather
> than on that player's own game-over. A racer who detonates still sees the mine
> that killed them, because `revealFrom` opens it and projection tells the truth
> about open cells; they simply do not see the other nine.

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

A practice race adds `practice` — how the room was opened, never the target it
races. See §5.

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
| `sendEmote` | `{room, emote}` — `emote` is a `shared/emotes.js` id, never free text | `server.js` |
| `pingCell` | `{room, row, col}` — a real cell; no `-1,-1` clear | `server.js` |
| `inviteFriend` | `{friendId, room}` — account-addressed, not room-addressed | `friendInviteController.js` |
| `roomFriends` | `{room}` — who here could be added | `roomFriendController.js` |
| `addRoomFriend` | `{room, playerId}` — `playerId` is a SOCKET id | `roomFriendController.js` |
| `cellHover` | `{room, row, col}` — `-1,-1` clears | `server.js:229` |
| `resetGame` | `{room}` | `server.js:269` |
| `startPvpGame` | `{room}` | `pvpController.js:7` |
| `resetMyBoard` | `{room}` | `pvpController.js:87` |
| `pvpRematch` | `{room}` | `pvpController.js:146` |
| `playerLeave` | — | `server.js:293` |
| `findMatch` | `{name}` — no room; there is not one yet | `matchmakingController.js` |
| `cancelMatch` | — | `matchmakingController.js` |
| `startPracticeRace` | `{name}` — answered with a plain `joinRoomSuccess` | `matchmakingController.js` |
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
| `playerEmote` | `{id, name, emote}` — to the whole room, sender included |
| `playerPing` | `{id, name, row, col, room}` — co-op only, suppressed in PVP like hover |
| `friendsOnline` | `{ids}` — which friends were already here, on connect |
| `friendPresence` | `{id, online}` — one friend came or went |
| `friendInvite` | `{fromId, fromName, fromAvatar, room, mode}` |
| `roomFriendsUpdate` | `{players: [{id, name, avatar, status}]}` — to the ASKER alone |
| `playerHoverUpdate` | `{id, row, col, name}` (client derives color from `id`) |
| `playerLeft` | `socketId` |
| `achievementsUnlocked` | `{ids}` — catalog ids, to ONE socket, only what this result newly earned |

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
| `matchSearching` | `{othersOnline}` — queued, nobody to pair with yet |
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

### When nobody is there to match

At low traffic the common quick-match outcome is nobody, so two things soften it.

**The wait says what is knowably true.** "No one else is searching right now"
is not a guess — reaching `matchSearching` *means* the queue held nobody
pairable, and anyone arriving later pairs immediately rather than queueing
alongside. **A queue depth would therefore always be zero and say nothing**; the
number that changes what a player should do is whether anyone is around at all,
so the payload carries `othersOnline` (connected sockets minus this one) rather
than a queue size.

**The practice race is a co-op room with one player.** After 20 seconds — or
immediately, for a player who already holds a record on the board, since they
need no explanation — the wait offers a solo board paced against a target time.
The target is that player's own best on those dimensions, or a fixed par when
they have none, labelled as par rather than dressed up as theirs.

`startPracticeRace` mints a `SOLO-` room, creates an ordinary **co-op** room at
`DEFAULT_PRESET` and answers with a plain `joinRoomSuccess`; board generation,
cell actions, the clock, the win check and best-time recording then all work
untouched. The target bar is drawn client-side by
`components/game/PracticeProgress.tsx` from the run clock and `lib/practice.ts`.

**The room records how it was opened; it never records the target.** One
boolean, `practice`, alongside `mode` and `noGuess` — the server has no time, no
opponent and no bar, and could not have the target at all, since it comes out of
the player's own browser records. It is stored rather than merely announced
because a reload has to find its way back: a resume re-joins through the
ordinary `joinRoom` handler, which knows only what the room says, so without it
the board, clock and score all returned while the opponent silently did not.

**The target belongs to the room, not to the click.** It is resolved in the
`joinRoomSuccess` handler from whichever room arrives, and an unlabelled room
clears it. Set optimistically when the player *asked*, it outlived every way the
request could fail to produce a room — a refused start left it standing over the
next ordinary room, and a player pulled into a real match got a target drawn on
top of a live PVP race.

That works because **a PVP opponent was never more than a percentage** —
`pvpOpponentProgress` carries nothing else, and no client ever sees an
opponent's board. So a time renders identically to a live racer without
anything pretending a second player exists. The corollary is the design rule:
it is a *target*, never a bot with a name. A practice clear does record a
personal best and account stats, because it is a genuine solo clear of a real
no-guess board — what is deliberately never written is a fake opponent result.

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

**Signed in, the record lives on the account.** The server writes
`user_board_bests` inside the same transaction that records the finished game
(`data/statsRepo.js`), from its own clock — so a record follows a player to
whatever device they sign in on next, which a browser-local one never could.
`components/BestsSync.tsx` fetches the table once per sign-in into
`state/bestsSlice.ts`, and `hooks/useBestTime.ts` reads it.

`lib/bestTimes.ts` is the **guest** copy of the same thing, in `localStorage`.
It is still written while signed in: it is what a signed-out player sees, and
what is left standing when a stats write drops (they are fire-and-forget on a
game path) or the stats service is down. A null account table therefore means
"read the browser" — signed out, not fetched yet, and unavailable all take the
same branch, because they all want the same behaviour.

**The first sign-in on a browser folds that copy in**, once, before the fetch
(`BestsSync`). Without it the account read would look like data loss on the day
it shipped: every record in existence was in localStorage, and the account only
knows boards cleared since results started being recorded. The endpoint is
keep-if-faster and idempotent, so doing it silently is safe; a failure is left
unmarked and retried next sign-in. The watermark is per BROWSER, not per
account — on a shared machine the second person to sign in should not inherit
the first's records, and the button on /profile covers anyone who does want it.

The fetched table is merged over what the store holds, keeping the faster of
each pair, rather than replacing it. A straight replace drops a clear finished
while the fetch was in flight — and that window is a real one: sign-in
resolving is what STARTS the fetch, with an import ahead of it on a first
sign-in. A clear landing before any table has arrived is held in
`pendingClears` and folded in when one does, because it cannot go in
`accountBests`: a table there means "these are the account's records", which
switches off the localStorage fallback for every other board. The cost of the
merge is that a record whose server write dropped outlives the fetch instead of
vanishing — the lesser wrong, since both numbers come off the same clock.

There is still no server *leaderboard* of these. They seed a private profile,
and the one client-reported write — the guest import at sign-up — is a
keep-if-faster upsert, so it can pad your own shelf and corrupt nothing. (The
daily challenge does have a real leaderboard; it can afford one because the
board is fixed and the time is server-authoritative.)

**How a record is identified is `shared/boardKeys.js`, read by both halves** —
the client to look one up, the server to write one. Two spellings of the same
key is a record written where nothing will ever look for it. That is why the
server derives the key in ONE place (`utils/statsRecorder`, from the board and
the room the game-over site already reports) and `recordResult` reads the count
back out of the key rather than recomputing it: the row's `players` column is a
display copy, and the key is the identity.

Records are keyed by the board's **dimensions and mine count**, not by its
size/difficulty labels: `setDimensions` gives a joining player the room's
numbers and leaves the labels at whatever they last picked, so a label-keyed
record would file a joiner's win under a board they never played.

**How many cleared it is part of that identity, not a note on it** — a group
clear takes an `@3` suffix and solo keeps the bare key. Two people splitting a
board finish faster than one person can more or less by construction, so with
one slot per board the group time takes it and holds it, and every solo run
afterwards silently fails to be a record. The server's rows carried the count in
a column and had exactly that bug; the `group-board-best-keys` migration re-files
them by the same rule the client applies on read.

A **race counts as one player** (`playersForClear`): you clear the whole board
yourself, even though the room holds two. The game still records as a
two-player game — only the record is solo.

Only a cleared board counts. A loss has a time but is not a completion, and
winning because an opponent disconnected is not one either. **The daily is
excluded**: it is a different board every day, so a daily clear would land on the
key an ordinary board of the same dimensions looks up and become a record for a
board nobody can play again. Its history is `user_daily_results`.

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

**The session id is a bearer credential, so a resume is refused while its socket
is still connected.** Whoever presents an id is offered that session's room code
and display name, and on the join that follows inherits its seat — the previous
player record is deleted and the room slot repointed. Nothing binds the id to a
socket, an account or an address, so a leaked one was the whole identity: a
client knowing only the id, and having never seen the room code, was handed
both. Every case a resume exists for — reload, dropped network, closed tab —
leaves the previous socket DISCONNECTED, so `utils/sessionGuard.js` treats a
still-connected holder as a takeover and refuses both the offer and the
handover. The second client still joins, as itself. A socket this process has
never heard of counts as not live, or a restart would refuse every genuine
reconnect.

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

**Rate limited on the server too, and that is not belt-and-braces.** This is the
only message a client sends continuously rather than on purpose, and the only
one that fans out to every other player in the room — four Redis reads and N-1
broadcasts each, with no cap on N since co-op rooms have no size limit. A single
socket ignoring the 100ms client throttle therefore took the whole server with
it: measured, a flood in one room pushed an *uninvolved* two-player room from
6ms to 2785ms per request and dropped three of seven, while receiving none of
the flood itself. The bucket (`domain/rateLimit.js`, 20/s with a burst of 20 —
double what the client can send) is checked before anything touches Redis, and
excess is dropped silently, which is what this handler already does with every
other refusal.

### Reactions (co-op and PVP)

Six drawn glyphs and nothing else. The tray calls `sendEmote`, the server
validates the id against `shared/emotes.js` and fans `playerEmote` out with
`io.to(room)` — everyone including the sender, so every copy of the feed
agrees and the sender's own reaction is not a second, locally-drawn one.

**The vocabulary being CLOSED is the feature, not a limitation.** Free text
would need a profanity filter, a report flow and somebody to read the reports;
a fixed set of ids needs none of that, and `isValidEmoteId` is what keeps it
that way — a length check there instead would quietly turn the protocol into
chat.

Unlike hover, this is **not** suppressed in PVP: an emote carries no board
information, so racers on the same board may taunt each other without either
learning anything about the mines. The `pingCell` planned in `SOCIAL_PRD.md`
Phase 2 does carry board information and follows hover's rule instead.

Rate limited by an **expression** bucket (`domain/rateLimit.js`, 1/s with a
burst of 3), keyed `socket.data.expressionBucket` and deliberately shared by the
whole category rather than one bucket per event — two of them would let a client
alternate and send at double the intended rate. The client-side half of the same
cap is the feed's three-chip limit in `state/roomSlice.ts`.

`settings.emotes` is a RECEIVE opt-out, applied in the client's handler so an
opted-out player accumulates no state and hears no blip. It never gates sending:
the setting means "no reactions on my screen", not a mute.

A chip's lifetime (`EMOTE_LIFETIME_MS`, `lib/emotes.ts`) is a plain timer, NOT a
`--ms-duration-*` token — one media query zeroes those under
`prefers-reduced-motion`, and somebody who asked for no motion still has to be
able to read the message. The float-and-fade on top of it is the part that may
be zeroed.

### Pings (co-op only)

"Look at this cell", as a ring on the board for ~2s. Same handler shape as an
emote and the same **shared** expression bucket — but **suppressed in PVP**,
exactly like hover and unlike an emote: both racers play the same board, so a
cell somebody points at is a move hint delivered to their opponent's screen.
`server/tests/pings.test.js` asserts both halves of that rule side by side.

**The interception is on the GRID, in the capture phase** (`Board.tsx`), not in
`Cell`. Cell has four render branches acting from four different handlers —
`onClick` on two inner hit areas, `onMouseUp` on an opened cell, `onContextMenu`
on a flagged one — so a modifier check per branch is four chances to miss one,
and a missed branch means a ping that opens the cell it points at. One capture
listener sits ahead of all of them, on the component mounted once rather than
512 times, and reads the cell's `data-row`/`data-col`.

It hooks **mousedown**, not click: the opened-cell branch acts on mouse UP, so a
handler waiting for the click would fire after the chord it was replacing. The
mouseup and click that follow are swallowed off a **latch** rather than by
re-asking whether a ping is armed — the arm is one-shot and clears the moment
the ping is sent, so by mouseup the answer has already changed. That bug shipped
briefly and did exactly what the design warns about: the ping fired *and* the
cell opened under it. The smoke suite caught it; the unit test had not, because
its mock `pingCell` never disarmed anything.

Three ways in, one for each kind of input: **Shift+click** (desktop), the tray's
one-shot **arm** then a click or tap (the only path a touch screen has), and
**P** on the keyboard cursor's cell. Alt was rejected for the desktop shortcut —
it is free in this codebase, but Linux window managers commonly grab Alt+click
to move a window, so the page may never see it. Ctrl is the macOS secondary
click, which is the flag.

### Friends

A **mutual** graph — both sides accept — reachable only by **friend code**.
Neither choice is incidental:

- A one-way edge that can invite you into a room is a spam primitive, so a
  friendship exists only once both have agreed. The only spam vector left is
  papering inboxes with requests, which is what the 20-outstanding cap is for.
- Adding is by code rather than by name search. Display names here are not
  unique and there are no public profiles (a decision from
  `USER_PROFILES_PRD.md`); a search box would reintroduce both, plus
  enumeration and a harassment surface. The alphabet omits O/0/I/1 because a
  code is read off one screen and typed into somebody else's box —
  `server/domain/friendCode.js`.

**Direction is preserved rather than normalised** into (least, greatest),
because a pending row has to know who asked. "My friends" is therefore the
union of both directions where status is `accepted`. The reciprocal case — B
asks A while A's request to B is pending — is an ACCEPT of the existing row,
not a second row facing the other way; without that, the pair key turns two
people doing exactly what the feature asks into a unique-violation.

**Blocks are asymmetric on purpose.** Blocking deletes whatever the pair held
and stores one row on the blocker's side, in a transaction — leaving an
accepted row behind would list two people as friends while one had blocked the
other. A block placed ON you is invisible and answers exactly like a code
nobody holds, so the refusal itself cannot tell you that you were blocked or by
whom. A block you placed IS listed, and only you can lift it: the PRD had blocks
unlisted entirely, which made blocking a one-way door — the other person's code
just stopped working with nothing on screen to explain it.

Caps (`friendsRepo`): **100 friends**, **20 outstanding requests**. Both are
about fan-out rather than storage — presence pushes and invites walk the friend
list. The friend cap is re-checked *inside* the accept statement, so an account
that filled up while requests sat pending cannot exceed it by accepting the
backlog.

Routes are `/api/friends` (GET the graph + your own code, POST a code) and
`/api/friends/:id` (PUT accept/decline/block, DELETE unfriend/cancel/unblock),
all under `requireUser`. The `:id` is the OTHER ACCOUNT's, not the row's — the
client already knows who it is acting on, and row ids are a handle it has no
other reason to hold.

### Presence and invites

**Presence is derived, never stored.** It is exactly "does this account have a
live socket", and the socket map already knows — so there is nothing to write
on connect, nothing to prune on disconnect, and no state that can survive a
crash and report a ghost as online. `server/utils/presence.js` owns the scan;
`statsRecorder` imports it rather than keeping a second copy, because two
copies are two places for the `user:<id>` room shortcut to creep back in.

**It is a scan and not a socket room, and that is a security property.** Room
codes here are arbitrary player-typed strings bounded only by length, so
`socket.join('user:<uuid>')` would share a namespace with the join box: anyone
who knew an account id could create that room and receive their traffic.

A **snapshot** goes to an arriving socket (`friendsOnline`) and a **delta** to
its online friends (`friendPresence`). A client that just connected has no
prior state to apply deltas to; recomputing every recipient's whole list would
be one query per friend per connect. Neither fires for a guest — presence runs
on every connect, so a query per anonymous socket would be a query per visitor
— and a second tab announces nothing, or a player closing one of two would wink
out for their friends while still playing.

**An invite is the one message this protocol lets an account send to another
account** rather than to a room, so every guard is about proving it was wanted:
an accepted friendship, a room the SENDER is in (otherwise an account could
send a friend into any room code it can name), space in it (PVP is full at
two), and a one-per-pair-per-minute cooldown held in memory. Every refusal is
silent, for the same reason the friends API answers a block like an unknown
code: "not your friend", "blocked you" and "not online" are each a fact about
somebody who did not choose to share it.

Accepting is a **navigation** into the existing `?room=` join flow, not a
socket call — that flow already fills the code, prompts for a name, and copes
with a room that filled up, and the invited player may be mid-game somewhere
else.

### Adding a friend from a game

The third and narrowest door onto the graph, after the code and the reciprocal
accept — and the one that decides whether the other two matter. A code is a
fine way to add somebody you already know; it is a terrible way to add the
stranger a quick match just paired you with, which is the one moment two people
have a reason to.

**Account ids never leave the server.** The client addresses a co-player by
SOCKET id — something it already sees on every hover, reaction and ping — and
`roomFriendController` turns that back into an account, but only after checking
that BOTH sockets are in the room. Without that second check it is a way to add
any account whose socket id you can name. Putting account ids in the room roster
instead would hand every player in a room a permanent handle for everybody
else, which is exactly what the code-only rule exists to prevent.

The list is computed per ASKER, which is what lets "me" be excluded server-side
rather than by a client comparing socket ids it would first have to be told. It
leaves out guests (no account to befriend), anybody either party has blocked (a
button that silently failed would be the one place a block leaked), and anybody
whose socket has gone — the account is resolved from the LIVE socket, so
somebody who closed their tab the moment the race ended is simply not offered,
which is honest rather than a button that does nothing.

Every add answers by re-sending the whole list rather than a per-player result,
so the client never holds two sources of truth about one relationship.

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
via `GET /api/stats`; the GAME reads the board records alone via
`GET /api/stats/bests`, which is a single query rather than the five that build
a profile page (§ Personal best times). The only stats write endpoint is the
guest best-times import, keep-if-faster by construction. A signed-in daily submit stores the
ACCOUNT display name on the leaderboard.

**Achievements ride the same transaction, and are derived rather than
tracked.** `domain/achievements.js` answers what a player satisfies given the
aggregates just written plus the game itself, and `recordResult` inserts the
lot with `ON CONFLICT DO NOTHING ... RETURNING`, so Postgres decides what is
actually new in one statement and no read precedes it. Two consequences worth
knowing. The evaluator reads a SNAPSHOT, not a delta, which makes every
threshold retroactive for free: a player who qualified before the feature
existed collects on their next finished game, with no backfill involved. And
because it is in the transaction, an achievement can never outlive a rolled-back
result — the same guarantee the aggregates get. Single-game achievements are
NOT retroactive and cannot be: `game_results` keeps only the recent window.
The catalog is shared (`shared/achievements.js`) because the shelf has to draw
locked entries and their progress; a counter carries its metric and threshold
as data so both halves evaluate the same rule, and only the single-game
predicates are server-side.

**Users live in Postgres** (`server/data/userRepo.js`, the first
Postgres-backed repo) keyed by `(provider, provider_account_id)`, created on
first sight with one upserting statement. Email refreshes each sign-in;
`display_name` deliberately does not — renames made on `/profile` must
survive. (The footer's user icon is state-aware: signed out it opens the
sign-in dialog, signed in it links straight to `/profile`, where the rename,
sign-out and delete controls live — deletion behind a typed-name confirm in
`app/profile/AccountPanel.tsx`.) Deletion is a hard `DELETE`; tables added by later phases must declare
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
npm run backfill:achievements  # ONE-SHOT after the achievements release; idempotent
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
| Achievement catalog | `shared/achievements.js` | moment predicates in `server/domain/achievements.js`, matched to the catalog by `achievements.test.js` |
| Redis key names | `server/data/keys.js` | — |
| CORS origins | `server/config.js` | — |
| Backend URL | `lib/initSocket.ts` (`NEXT_PUBLIC_SOCKET_URL`) | — |
| Join-link query param | `lib/roomLink.ts` (`ROOM_QUERY_PARAM`, `buildJoinUrl`) | — |
| Cell reveal (flood fill) | `domain/board.js` `revealFrom()` | each mode wraps it to react to a mine: co-op ends the room's game, PVP ends only that player's |
| Neighbor enumeration | `domain/board.js` `getAdjacentCells()` | plus `solverUtils.js:10` (`getAdjacentCoords`) and inline loops in `gameUtils.js:56` and `:250` |
| Board rendering | `components/game/Board.tsx` | mounted once; the layouts sit either side of it (trap #3) |
| The run clock's reading | `lib/gameClock.ts` | the live timer and the summary both use it, so they cannot disagree |
| Daily terminal statuses | `server/data/dailyRepo.js` (`TERMINAL_STATUSES`) | mirrored by name in `state/dailySlice.ts`'s `DailyStatus` |
| A board's identity for records | `shared/boardKeys.js` (`boardKey`, `playersForClear`) | dimensions + mines + how many cleared it, never the size/difficulty labels; read by BOTH halves so a record is spelled one way |
