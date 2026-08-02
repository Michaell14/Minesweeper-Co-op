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

### Phase 1 — Auth & identity ✔ Code done 2026-08-02 · awaiting OAuth apps + secrets

- [ ] Create Google + GitHub OAuth apps; secrets into Vercel + Heroku —
      **manual step, Michael**. Vercel additionally needs `NEXTAUTH_URL`,
      `NEXTAUTH_SECRET`, and `AUTH_BRIDGE_SECRET`; Heroku needs the same
      `AUTH_BRIDGE_SECRET`. Until set, the account dialog says sign-in is not
      configured and everything else is unaffected
- [x] Auth.js v4 in the Next app with the two providers
      (`lib/authOptions.ts`, `app/api/auth/[...nextauth]/route.ts` — the
      app's first API routes). Providers register only when their env pair is
      set; the client discovers them via NextAuth's providers endpoint
- [x] HS256 shared-secret JWT — landed as a **separate bridge token**
      (`app/api/socket-token/route.ts`, signed with jose) rather than
      re-shaping NextAuth's own cookie: the session stays an encrypted JWE and
      the game server sees only a purpose-built 1h token with minimal claims.
      Cached client-side by `lib/authBridge.ts`; jose↔jsonwebtoken interop
      verified live
- [x] Express verification: `server/utils/authToken.js` (never throws) +
      io middleware in `server.js` → `socket.data.user | null`, presented via
      a re-evaluating handshake `auth` function in `lib/initSocket.ts`.
      Policy proven live: valid token creates the user row; garbage, absent,
      or database-down all connect anonymous
- [x] `server/data/userRepo.js` — single-statement upsert keyed on the OAuth
      identity (two-tabs race safe); email refreshes per sign-in,
      display_name never overwritten by sign-in
- [x] `server/controllers/profileController.js` + REST: GET/PUT/DELETE
      `/api/me` (PUT added for renames), CORS widened for
      PUT/DELETE/Authorization, `express.json()` scoped to `/api`. Socket
      path degrades to anonymous; REST answers 401/503 honestly
- [x] Sign-in/out UI: account button + dialogs in the Footer cluster
      (`components/AccountMenu.tsx`, new `UserIcon`), display-name edit with
      save/error states; Enter is intercepted so the dialog form doesn't
      close-without-saving
- [x] Account deletion: hard delete + `alert` confirm dialog; later tables
      cascade via FK (recorded in userRepo and ARCHITECTURE.md)
- [x] Privacy: a Privacy dialog (not a separate page — one-page app) stating
      exactly what is stored and how deletion works, linked from the account
      dialog
- [x] ARCHITECTURE.md: "Accounts and the auth bridge" section + config table
- [x] Tests: `authToken.test.js` (expiry, wrong secret/issuer/audience,
      unsigned, no-secret mode), `userRepo.test.js`, `profileController.test.js`
      (both failure policies), client `authBridge.test.ts` +
      `AccountMenu.test.tsx`. Suites: 37 server / 24 client files green;
      ui-smoke green. Live-verified: full REST round-trip + socket handshake
      against a real Postgres

**Deviation from sketch:** the socket carries the whole verified user object as
`socket.data.user` (not just an id) — game-end recording in Phase 6 needs the
display name anyway and it saves a lookup.

### Phase 2 — Settings foundation ✔ Done 2026-08-02

- [x] `lib/settings.ts`: one versioned blob, per-key sanitiser registry
      (adding a setting = a type key, a default, a sanitiser), the same
      blocked-storage tolerance as `bestTimes`. `sanitizeSettings` is the
      single gate for BOTH storage and the server, so the two sources cannot
      disagree about validity
- [x] `state/settingsSlice.ts`: `settings` + `settingsHydrated`,
      `hydrateSettings` (post-mount read; render-time reads are hydration
      mismatches), `setSetting`, `replaceSettings` (server-wins path);
      per-field selectors throughout
- [x] `/settings` route: server-component wrapper (noindex metadata) +
      `SettingsClient` with titled Panel sections (Appearance, Account) and a
      gear icon in the Footer cluster linking to it
- [ ] DS primitives (Slider, Select, Tabs) — **deliberately deferred** to the
      phase that first consumes them (volume → Phase 4, selects → Phase 3):
      a primitive built without a consumer gets designed twice
- [x] `NO_FLASH_SCRIPT` reads the settings blob (falling back to the legacy
      key), moved to `lib/settings.ts` with the rest of persistence
- [x] Server sync: `user_settings` (JSONB, ON DELETE CASCADE — verified live:
      deleting the account removed the settings row),
      `server/data/settingsRepo.js` upsert, `GET/PUT /api/settings` behind
      `requireUser`; the blob is opaque server-side except an 8KB shape/size
      cap in `validation.js` (client owns the schema; both directions
      sanitised there)
- [x] Conflict rule implemented in `components/SettingsSync.tsx`: server wins
      at sign-in (fresh-browser defaults must not clobber the account); empty
      server gets seeded with the local copy; debounced last-write-wins push
      afterwards; a pull is not echoed back up
- [x] Signed-out: localStorage only, verified in the browser
- [x] Theme storage migrated into the blob. Verified live in the browser: a
      pre-blob `ms-theme` browser paints its palette before hydration, the UI
      reflects it, and the first write moves it into the blob and retires the
      legacy key. ThemePicker and the settings page share `ThemeCards` +
      the slice, so two mounted theme UIs cannot disagree
- [x] Tests: `lib/settings.test.ts` (sanitise round-trip, unknown-key drop,
      legacy migration, no-flash executed under jsdom for both storage
      shapes), `SettingsClient.test.tsx` by accessible name,
      `settingsRepo.test.js`, `settingsController.test.js`. 663 server + 235
      client green; ui-smoke green; live REST round-trip verified against a
      real Postgres

### Phase 3 — Gameplay preferences & HUD ✔ Done 2026-08-02

Ended up **entirely client-side** — see the two decisions at the bottom.

**Client-only**
- [x] Swap left/right click: `primaryAction`/`secondaryAction` mapping in
      `Cell.tsx`. Mousedown keeps recording PHYSICAL buttons (the chord latch
      needs them); only what each release fires is swapped. On a flagged cell
      both buttons fire their mapped action and the server's flag protection
      no-ops the wrong one. Mobile taps follow the flag-mode toggle, never the
      swap. Covered by button-mapping tests in `Cell.test.tsx`
- [x] Default mobile flag-mode: `mobileDefaultFlag` seeds `isChecked` in
      `hydrateSettings` ONLY — a sync arriving mid-run must not flip the
      in-game toggle under the player
- [x] Confetti toggle: gated inside `shootConfetti` so every caller (own win,
      teammate's shared burst) obeys it; composes with `prefersReducedMotion`.
      SENDING confetti is ungated — the setting is about your screen
- [x] Timer visibility (component-gated; runs still timed for the summary) ·
      Flag-counter visibility (live variants only — the summary dialog is a
      report, not a HUD) · Progress-bar visibility (gated in `Grid.tsx`, whole
      titled panel, so no empty box remains)
- [x] Cell size: `compact | standard | large` as token variants
      (`--ms-cell-size-{compact,large}` in tokens.css) selected via
      `data-cell-size` on the board — a different CEILING for the viewport-fit
      clamp, so `large` still shrinks on phones. Verified live: compact board
      measured at exactly 30px cells
- [x] Hover-presence opt-out (`shareCursor`): gated in `emitCellHover`, with
      the (-1,-1) clear still allowed through so toggling off removes your
      cursor from teammates' boards instead of freezing it there
- [x] `/settings` gains Gameplay + HUD sections (Switch rows via a shared
      `SettingRow`, cell-size RadioCards); the floating footer cluster now
      hides on /settings, where it overlapped the controls and everything it
      opens is on the page anyway

**Server-touching — resolved to zero server work**
- [x] **Question-mark flags: deferred, deliberately.** The cell shape
      (`isQuestioned`) ripples through projection, chording's flag counts,
      both mode files and the validation layer — a high-cost change for a
      low-demand feature. Recorded here; revisit only if players ask
- [x] Chord on/off: client-side suppression in `useChording` + `Cell`
      (middle-click). The latch still sets with chording off, so a
      both-buttons press does nothing rather than two accidents. A hacked
      client re-enabling chording is just… a player chording — not an
      integrity concern
- [x] Transport decision: **no per-player prefs reach the server at all** in
      this phase, so no handshake field, no event, no four-place tax

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
- [x] Question-mark flags — **deferred at Phase 3** (2026-08-02): the cell-shape
      and projection ripple outweighs demand; revisit only if players ask
- [ ] Recent-window size (default 50) — confirm before Phase 6

## 9. Progress log

| Date | Change |
|---|---|
| 2026-08-02 | PRD created; all top-level decisions settled (see §2). |
| 2026-08-02 | Phase 0 code complete: pg pool singleton (`utils/initializePgClient.js`), `users` migration, `release:`-phase runner, layering + mockInfra updates, `pgClient.test.js`. Full suite green (34 suites / 606 tests). Migration verified up/down against a real Postgres 14. Outstanding: provision Heroku Postgres (manual). |
| 2026-08-02 | Phase 1 code complete: Auth.js (Google+GitHub) + bridge-token pipe end to end — socket-token route, client cache, handshake auth function, server verify → `socket.data.user`, `userRepo`, `/api/me` GET/PUT/DELETE, account/delete/privacy dialogs in the Footer. 642 server + 211 client tests and ui-smoke green; REST round-trip and socket auth verified live against a real Postgres (jose-signed token, jsonwebtoken verify). Outstanding: create the OAuth apps and set the five secrets (manual). |
| 2026-08-02 | Phase 2 complete: settings blob (`lib/settings.ts`) + slice + `/settings` page + `SettingsSync` (server-wins at sign-in, debounced last-write-wins after); theme migrated into the blob with the legacy `ms-theme` fallback in the no-flash script; `user_settings` JSONB mirror with GET/PUT routes. Verified live: REST round-trip + upsert + cascade delete against real Postgres; browser checks of theme persistence, pre-blob migration, and legacy-key retirement. DS Slider/Select deferred to their consuming phases. |
| 2026-08-02 | Phase 3 complete: nine settings (swap buttons, mobile flag default, chording, confetti, share-cursor, timer/flag-counter/progress visibility, cell size) wired through Cell/useChording/confetti/emitCellHover/HUD components; Gameplay + HUD sections on /settings; cell size as token-variant ceilings. Resolved to zero server work: chording suppressed client-side, question marks deferred (recorded in §8). Verified live in the browser (compact cells measured 30px, timer hidden, settings persisted); server 663 + client 244 tests and ui-smoke green. |
