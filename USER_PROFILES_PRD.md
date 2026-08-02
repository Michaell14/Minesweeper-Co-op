# PRD: User Profiles & Customization

**Status:** Not started · **Owner:** Michael · **Created:** 2026-08-02

A living document. Each phase has a checklist; check items off as they land and
update the phase status line. Keep the *Decisions* table current — if a decision
changes, edit it here first, then the code.

---

## 1. Summary

Add Monkeytype-style user profiles: sign in with an account, customize the game
and site heavily (themes, gameplay preferences, sound, HUD), and see private
stats (aggregates plus a recent-games window) that the *server* records — a
client can no longer report its own results.

This is a new axis for the codebase. Today there is **no durable storage of any
kind**: Redis is the only backend store and every key carries a TTL (rooms and
sessions 24h, daily data 48h — `server/data/keys.js`). Everything personal is
browser-local — theme (`lib/theme.ts`), best times (`lib/bestTimes.ts`), the
daily attempt token (`lib/dailyIdentity.ts`). There are no accounts, no HTTP
API, no database, and the frontend talks to the game server exclusively over
sockets. All four of those change.

## 2. Decisions (settled 2026-08-02)

| Question | Decision | Notes |
|---|---|---|
| Where profiles live | **Full accounts, server-authoritative** | Not local-only, not local-first-with-sync. |
| Auth | **Auth.js (OAuth-only: Google + GitHub)** | No passwords, no email infra, no recovery flows — providers own identity. Users without Google/GitHub cannot sign up; accepted. |
| Database | **Heroku Postgres** (`pg` + `node-pg-migrate` in `server/`) | Redis stays exactly what it is: ephemeral live-game state. |
| Profile visibility | **Private stats only** | No public profile pages, no persistent global leaderboards. Deletes name-uniqueness, moderation, and most anti-cheat scope. |
| Stats depth | **Aggregates + recent window** | Lifetime aggregates, per-board bests, plus the last ~50 games in detail. Not full unbounded history. |
| Customization scope | **All four areas** | Custom themes/palette editor, gameplay preferences, sound (from zero), HUD/layout options. |
| Daily challenge tie-in | **Name + history only** | Signed-in daily entries show the account display name and flow into private stats. Leaderboard stays the same 48h board. Anonymous path untouched. |
| Signed-out play | **Never regresses** | Every feature works signed out; settings fall back to localStorage. Accounts are additive. |

## 3. Goals / Non-goals

**Goals**

- Sign in with Google or GitHub; a verified identity reaches the game server.
- Game results (co-op, PVP, daily) are recorded server-side for signed-in
  players at the moment the server decides the game ended.
- A `/settings` page covering appearance, gameplay, sound, and HUD, synced to
  the account and cached locally for pre-hydration paint.
- A theme editor: author, save, and apply custom palettes on top of the
  existing `--ms-palette-*` layer.
- A private `/profile` dashboard: aggregates, streaks, per-board bests, recent
  games, simple trends.
- Account deletion that actually deletes.

**Non-goals**

- Public profiles, friend systems, chat, avatars.
- Persistent global leaderboards (the 48h daily board is unchanged).
- Migrating anonymous play onto accounts — guests stay first-class.
- Anti-cheat beyond "the server records results itself." Private stats make
  cheating self-defeating.
- Email/password or magic-link auth.

## 4. Architecture

The repo-specific wrinkle: frontend (Vercel/Next) and game server
(Heroku/Express+Socket.io) are separate deployables that today only talk over
sockets. Accounts span both.

```
Browser ── Auth.js (Next route) ──► Google / GitHub OAuth
   │              │
   │              └─► JWT (shared-secret HS256, so CJS server can verify)
   │
   ├── socket handshake { sessionId, token? } ──► Express middleware verifies
   │                                              → socket.data.userId | null
   │
   └── REST /api/profile|settings|themes (Express) ── JWT auth ──► Postgres
                                                          ▲
Game end (co-op / PVP / daily) ── server writes results ──┘
```

- **Auth on the client, verification on both servers.** Auth.js lives in the
  Next app (its route handler is the app's first API route — ARCHITECTURE.md's
  "sockets only" claim gets amended). The JWT uses a shared secret so the
  CommonJS Express server verifies it with one small middleware, applied to the
  socket handshake and the REST routes alike.
- **Unauthenticated sockets are fully functional.** `socket.data.userId` is
  simply null and no results are recorded.
- **Stats are written by the game server, never sent by the client.** The three
  game-end sites (co-op win/loss, PVP finish, daily submit) write result rows
  for each authenticated participant. This is what "server-authoritative" buys.
- **Settings/themes go over REST on Express** — the server's first HTTP surface
  beyond health checks. Settings aren't integrity-sensitive; client writes are
  fine.
- **Postgres beside Redis, not instead of it.** Redis keeps live rooms,
  sessions, locks, the daily template. Postgres holds anything that must
  outlive a TTL.
- **Guest → account:** on first sign-in, offer a one-time import of the
  browser's `bestTimes` blob (client-reported; folded in as-is). Signed in, the
  server copy of settings wins and localStorage becomes a cache the no-flash
  script reads.

## 5. Data model (Postgres)

Migrations via `node-pg-migrate`, run from `heroku-postbuild`.

| Table | Contents |
|---|---|
| `users` | id, provider, provider_account_id, email, display_name, created_at |
| `user_settings` | user_id PK, `settings` JSONB, updated_at — schema churn hits a validator, not a migration |
| `user_themes` | id, user_id, name, `palette` JSONB (~15 palette-layer entries), created_at |
| `user_stats` | user_id PK, per-mode games/wins, current + best streak, last_played_at |
| `user_board_bests` | user_id, board_key, seconds, players, achieved_at |
| `game_results` | id, user_id, mode, board_key, won, duration_ms, players, finished_at — pruned to last ~50 per user on insert |

`board_key` is always `rows x cols / mines` (`lib/bestTimes.ts` `boardKey`),
**never** size/difficulty labels — trap #10 in CLAUDE.md: labels file a
joiner's result under a board they never played.

Daily linkage: an authenticated daily start writes `userId` onto the attempt
hash in Redis; submit writes the Postgres `game_results` row and the
leaderboard row shows the account display name.

## 6. Repo-specific constraints (read before building)

- **Every new socket event touches four places** or `server/tests/events.test.js`
  fails: `shared/events.js`, `shared/socketPayloads.ts`, the server
  handler/emit, the client table in `hooks/useGameEvents.ts`.
- **Server layering is test-enforced** (`tests/layering.test.js`). New pieces
  slot in as: `db` singleton beside the Redis singleton → `userRepo` etc. in
  `data/` → controllers in `controllers/`. No upward imports, no cycles.
- **The server is CommonJS.** No TS imports; inbound payloads validated by hand
  in `server/validation.js`.
- **UI comes from `components/ds/`**; colours/sizes/durations are tokens in
  `app/tokens.css`. Anything animating reads a `--ms-duration-*` token.
- **Anything affecting first paint** must extend the `NO_FLASH_SCRIPT` pattern
  (`lib/theme.ts`) or it flashes defaults on every load; reads during render
  are hydration mismatches.
- **Dialogs are native `<dialog>`** via `lib/dialogs.ts` ids; close buttons use
  `<DialogClose>`.
- **New env/config:** OAuth client ids/secrets and the JWT secret land in both
  Vercel and Heroku config; `DATABASE_URL` in Heroku. Document in
  ARCHITECTURE.md §6.

---

## 7. Phases

Order is dependency order. Every phase is independently deployable; signed-out
play must never regress. Estimated total: **4–5 weeks** focused.

### Phase 0 — Infrastructure ✔ Code done 2026-08-02 · awaiting Heroku provisioning

Small but load-bearing; everything stacks on it.

- [ ] Provision Heroku Postgres; `DATABASE_URL` in Heroku config — **manual
      step, Michael** (needs the Heroku account; everything below skips
      harmlessly until it exists)
- [x] Add `pg` + `node-pg-migrate` to `server/package.json` (as regular deps —
      Heroku prunes only the root package's devDeps, but release-phase needs
      these at runtime)
- [x] Pool singleton beside the Redis singleton — landed as
      `server/utils/initializePgClient.js`, following the existing
      `initialize*Client` naming/layer-1 convention rather than the PRD's
      `data/db.js` sketch. Optional by design: no `DATABASE_URL` → no pool,
      `isDbEnabled()` false, one boot log line, game untouched
- [x] Wire migrations into the deploy — as a **`release:` phase** in
      `/Procfile` (`scripts/run-migrations.js`), not `heroku-postbuild`:
      release runs after the build with full config vars, and a failure aborts
      the release instead of booting a server ahead of its schema. Rollback:
      `npm --prefix server run migrate:down`; expand→migrate→contract rule
      documented in the runner
- [x] Update `tests/layering.test.js`: pg singleton admitted at layer 1;
      `migrations/` excluded from the runtime graph as a documented decision
- [x] First migration: `users` table (uuid PK, OAuth identity unique on
      `(provider, provider_account_id)`, email deliberately non-unique).
      Verified up + down + duplicate-identity rejection against a real
      Postgres 14
- [x] Local dev story: documented opt-out (ARCHITECTURE.md §7) — the game runs
      fully without Postgres; contributors touching accounts set
      `DATABASE_URL` and run `npm --prefix server run migrate`
- [x] Test infra decided: `mockInfra.js` globally mocks the pg singleton as
      *disabled* (matches a database-less deploy; nothing reaches real infra);
      repo tests will declare per-file mocks like the Redis pattern; a
      `fakeDb` waits until a concurrency test actually needs one (Phase 6).
      New `tests/pgClient.test.js` covers both modes of the real module

### Phase 1 — Auth & identity ░ Not started · est. 4–6 days

- [ ] Create Google + GitHub OAuth apps; secrets into Vercel + Heroku
- [ ] Auth.js in the Next app (first API route) with the two providers
- [ ] JWT strategy: HS256 shared secret so the CJS server can verify
- [ ] Express middleware verifying JWTs; applied to socket handshake →
      `socket.data.userId | null`
- [ ] `server/data/userRepo.js` (create-or-get on first sign-in, lookups)
- [ ] `server/controllers/profileController.js` + REST routes: `GET /api/me`,
      `DELETE /api/me`
- [ ] Sign-in/out UI: DS-styled account menu (header/footer), display-name edit
- [ ] Account deletion: hard-delete user + settings + themes + results; confirm
      dialog; document in a privacy note
- [ ] Privacy policy page/section (email storage now exists)
- [ ] Amend ARCHITECTURE.md: auth flow, first API route, new config vars
- [ ] Tests: JWT middleware (valid/expired/absent), userRepo, deletion cascade

### Phase 2 — Settings foundation ░ Not started · est. 4–5 days

- [ ] `lib/settings.ts`: typed schema, defaults, validate/read/write with the
      blocked-storage tolerance `bestTimes`/`theme` already use
- [ ] `state/settingsSlice.ts`; per-field selectors (subscription note in
      ARCHITECTURE.md §2 — no bare store reads)
- [ ] `/settings` route (third route in the app) with sectioned/tabbed layout
- [ ] New DS primitives as needed: Slider, Select, Tabs/SectionNav — built in
      `components/ds/`, catalogued on `/ds`
- [ ] Extend `NO_FLASH_SCRIPT` for paint-affecting settings
- [ ] Server sync: `GET/PUT /api/settings` (JSONB), JWT-authed
- [ ] Conflict rule: server wins at sign-in, last-write-wins afterwards
- [ ] Signed-out: settings persist in localStorage only
- [ ] Migrate the theme picker's storage into the settings blob (keep the
      `ms-theme` key readable for back-compat, or write a one-time migration)
- [ ] Tests: settings validation round-trip; component tests for the settings
      page's accessible names (`getByRole` per testing guidance)

### Phase 3 — Gameplay preferences & HUD ░ Not started · est. 4–6 days

Client-only first, server-touching second.

**Client-only**
- [ ] Swap left/right click (open ↔ flag)
- [ ] Default mobile flag-mode (`isChecked` initial value from settings)
- [ ] Confetti toggle (compose with `prefersReducedMotion()` in `lib/motion.ts`)
- [ ] Timer visibility · [ ] Flag-counter visibility · [ ] Progress-bar visibility
- [ ] Cell size (spacing token scale, not raw px)
- [ ] Hover-presence opt-out — **privacy setting**: stops broadcasting your
      cursor to the room (client simply stops emitting `cellHover`)

**Server-touching** (each pays the four-place socket-event tax)
- [ ] Question-mark flag state (cell cycle closed → flag → ? → closed; touches
      the cell shape — scope carefully, may need `isQuestioned` on cells and
      projection updates in `server/domain/board.js`)
- [ ] Chord on/off (client-side suppression may suffice — prefer that; only go
      server-side if needed)
- [ ] Decide transport: prefs ride the socket handshake vs. a `setPrefs` event;
      validate in `server/validation.js`

### Phase 4 — Sound ░ Not started · est. 3–5 days

The repo has zero audio today; this is from scratch.

- [ ] Source/produce SFX set (reveal, flag, cascade, mine, win, lose, chord,
      UI clicks) — 8-bit to match the aesthetic; license documented
- [ ] `lib/sound.ts`: preload, play, master + per-category volume, mute;
      user-gesture unlock for browser autoplay policy
- [ ] Hook into game events (reveal/flag/cascade/win/loss) via the existing
      handler table — no new socket events needed
- [ ] Settings: master volume, SFX volume, mute toggle (Slider from Phase 2)
- [ ] Default: muted or low until the user opts in (avoid the surprise-audio
      first impression)
- [ ] Respect a "no sound on background tabs" sanity check
- [ ] Tests: `lib/sound.ts` state machine (pure logic; no jsdom audio needed)

### Phase 5 — Theme editor ░ Not started · est. 5–7 days

The palette layer (`app/tokens.css` two-layer system) makes this tractable;
the delivery mechanism is the work.

- [ ] Custom palettes apply as custom-property overrides on `:root` (inline
      style injection), NOT as `data-theme` blocks — they don't exist in
      tokens.css at build time
- [ ] Rework `lib/theme.ts`: admit `custom:<id>` alongside built-in ids;
      `VALID_IDS` allowlist and `NO_FLASH_SCRIPT` both updated (script reads a
      cached palette blob from localStorage and stamps properties pre-paint)
- [ ] Editor UI on `/settings`: colour inputs for the ~15 palette entries,
      live preview against real components
- [ ] Live WCAG contrast audit in the editor (reuse the `/ds` audit maths —
      it has unit tests; the build-time ratchet can't see user palettes)
- [ ] Allow saving failing palettes with a visible warning (their eyes, their
      call) — decision recorded here
- [ ] Save/load/delete themes: `user_themes` CRUD over REST; localStorage for
      signed-out users
- [ ] Cursor ramp (`--ms-palette-cursor-1..6`) and number colours included in
      the editable set, or explicitly derived — decide and document
- [ ] Guard: `app/tokens.test.ts` invariants still hold for built-in themes;
      add a validator that a custom palette only sets palette-layer names
- [ ] Tests: palette validation, `custom:` id round-trip, no-flash behaviour

### Phase 6 — Stats & profile page ░ Not started · est. 4–5 days

- [ ] `server/data/statsRepo.js`: record result + update aggregates in one
      transaction; prune `game_results` to the recent window on insert
- [ ] Wire the three game-end sites: co-op win/loss, PVP finish, daily submit —
      record for each **authenticated** participant; guests skipped silently
- [ ] Co-op records `players` count (a 3-player clear ≠ solo, per
      `lib/bestTimes.ts` reasoning)
- [ ] Daily linkage: authenticated start writes userId onto the attempt;
      leaderboard rows show account display name; anonymous path untouched
- [ ] Server-side board bests (`user_board_bests`) alongside, not replacing,
      the localStorage `bestTimes` (guests keep theirs)
- [ ] One-time guest import: offer to fold the browser's `bestTimes` into the
      account on first sign-in
- [ ] `/profile` route (private, own-account only): aggregates, win rate,
      streaks, per-board bests table, recent-games table, simple trend from
      the window
- [ ] Streak logic: UTC day boundaries, missed-day reset — unit-tested pure
      module
- [ ] Tests: transaction atomicity, prune behaviour, parity with the scoring
      rule (`scoringParity.test.js` stays green), streak edge cases

---

## 8. Risks & open questions

| Risk | Mitigation |
|---|---|
| Postgres outage takes down the game | All game paths treat Postgres as best-effort: a failed stats write logs and drops, never blocks a game. Only `/settings`, `/profile`, and sign-in genuinely depend on it. |
| JWT secret drift between Vercel and Heroku | One secret, documented in ARCHITECTURE.md §6; verify:deploy could assert an authed round-trip post-release. |
| `heroku-postbuild` migration failure mid-deploy | Migrations must be backwards-compatible one release back (expand-migrate-contract); document in Phase 0. |
| Settings blob schema drift | JSONB + a versioned validator in `lib/settings.ts` / `server/validation.js`; unknown keys dropped, missing keys defaulted. |
| Custom themes with unreadable contrast | Live audit + explicit warning on save (decision: allowed). Built-in themes stay under the build-time ratchet. |
| Contributor setup friction (now needs Postgres) | `dev:all` auto-starts or clearly no-ops it; the game must run without a database for anyone not touching profiles. |

**Open (decide when reached):**

- [ ] Display-name rules (length/charset) — private-only, so minimal; decide in Phase 1
- [ ] Whether the daily streak (the Wordle hook) ships in Phase 6 or later — the
      `game_results` rows make it cheap to add
- [ ] Whether question-mark flags are worth the cell-shape/projection change or
      get cut — decide at Phase 3
- [ ] Recent-window size (default 50) — confirm before Phase 6

## 9. Progress log

| Date | Change |
|---|---|
| 2026-08-02 | PRD created; all top-level decisions settled (see §2). |
| 2026-08-02 | Phase 0 code complete: pg pool singleton (`utils/initializePgClient.js`), `users` migration, `release:`-phase runner, layering + mockInfra updates, `pgClient.test.js`. Full suite green (34 suites / 606 tests). Migration verified up/down against a real Postgres 14. Outstanding: provision Heroku Postgres (manual). |
