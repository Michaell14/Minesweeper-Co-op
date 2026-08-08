# PRD: User Profiles & Customization

**Status:** All six phases code-complete (2026-08-02) · **Owner:** Michael · **Created:** 2026-08-02

Outstanding manual steps, both flagged in their phases: provision Heroku
Postgres (Phase 0) and create the OAuth apps + set the five secrets (Phase 1).
Until then every account feature degrades gracefully and the game is unchanged.

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

### Phase 4 — Sound ✔ Done 2026-08-02

The repo had zero audio; it still has zero audio FILES.

- [x] SFX are **synthesised, not sourced**: square/triangle blips built with
      the Web Audio API at play time (`lib/sound.ts`), pitched on a C-major
      arpeggio. No assets means nothing to license, load, preload or
      cache-bust, and every sound is editable in place as numbers — the same
      spirit as the character-grid icon sprites. Set: reveal, flag, unflag,
      chord, cascade, win, lose. UI clicks cut (wiring every DS Button is
      invasive for marginal delight); music deferred — procedural music is a
      project of its own, revisit if ever wanted
- [x] `lib/sound.ts`: lazy AudioContext, per-play master gain from the volume
      setting, settings gate INSIDE `playSound` (mirroring lib/confetti.ts) so
      call sites stay one-liners; `installSoundUnlock` resumes the context on
      the first user gesture (from SettingsSync) so server-initiated sounds —
      a win landing, a teammate's cascade — are audible; a play that finds the
      context still suspended is dropped, never queued to fire stale
- [x] Wired with no new socket events: reveal/flag-vs-unflag/chord decided
      client-side at the emit helpers (both room and daily), cascade detected
      in the shared `applyCellUpdates` (server only sends changed cells, so
      >8 newly-open cells = a flood fill — fires for teammates' sweeps too),
      win/lose at all seven terminal sites in `useGameEvents` (co-op, both
      PVP outcomes, opponent-disconnect win, daily won/failed)
- [x] Settings: Sound panel with the master toggle + volume Slider + a
      Preview button (which is also the surest unlock — a real click). One
      volume, not per-category: there is one category
- [x] **Off by default** (`sound: false`) — nobody gets surprise audio;
      volume clamped to [0,1] by the sanitiser
- [x] Background tabs stay silent (`document.hidden` gate) — socket events
      still arrive there
- [x] DS **Slider** built (its first consumer arrived, per the Phase 2
      deferral): a restyled native range input — keyboard/screen-reader
      behaviour from the browser, square thumb and track matching the Switch;
      catalogued on `/ds`
- [x] Tests: `lib/sound.test.ts` gates against a fake AudioContext (off by
      default, volume zero, background tab, refused unlock dropped not
      queued, context reuse, per-blip scheduling), Slider round-trip,
      sound-section page tests, volume sanitiser. 663 server + 259 client +
      ui-smoke green; verified in a real browser (enabled via the UI, Preview
      played through an unlocked context, no console errors)

### Phase 5 — Theme editor ✔ Done 2026-08-02

The design that made it land: **nine core colours in, the full ~60-entry
palette DERIVED** (`lib/customThemes.ts`) — bevels are the cell colour
lightened/darkened, intent variants are tints, ink-on-fill is whichever of
black/white reads (computed with the real WCAG maths). Nine pickers instead of
sixty is what keeps a hand-built theme coherent.

- [x] Custom palettes apply as inline custom-property overrides on `:root`;
      `applyTheme` clears residue by walking the style object (so switching
      custom → built-in leaves nothing behind — verified live: 59 overrides
      → 0), and only `--ms-palette-*` names are ever stamped
- [x] `custom:<slug>` admitted by the settings sanitiser; `NO_FLASH_SCRIPT`
      resolves it against the cached theme blob and stamps the palette
      pre-paint — palette-layer names and hex values only, so user-writable
      storage can't smuggle arbitrary properties into a style attribute.
      Verified live: reload painted 59 properties with no data-theme
- [x] Editor on `/settings` (`components/ThemeStudio.tsx`): nine labelled
      colour inputs seeded from the CURRENT resolved paint, name field, and a
      live whole-page preview — the settings page is itself themed, so the
      page IS the preview
- [x] Live legibility audit from the same `app/ds/contrast.ts` maths: text on
      page/panels, button labels, worst number on the open-cell fill, and a
      closed-vs-open distinguishability row
- [x] Failing palettes save with a warning ("Save anyway") — their eyes,
      their call; Game Boy can't pass everywhere either
- [x] CRUD + sync: `user_themes` (PK `(user_id, id)`, ON DELETE CASCADE —
      verified live), `themesRepo`, GET/PUT/DELETE `/api/themes` with the cap
      gating NEW themes only (updates at the cap still land); client
      localStorage shelf (20 max) with a MERGE at sign-in — themes are a
      collection, so a fresh browser must not erase the account's shelf, nor
      sign-in discard local drafts; id collisions go to the server
- [x] Cursor ramp and numbers: **derived, not editable** (the open decision) —
      cursors as intent-hue mixes, numbers keep their classic colours where
      they clear 3:1 on the custom open-cell fill and darkness-code where they
      don't (the Game Boy trade, automated). Verified in the editor: dark
      board → numbers re-derived, audit showed 3.5:1
- [x] Guards: `tokens.test.ts` untouched and green (custom themes never touch
      tokens.css); `sanitizeCustomTheme` RE-DERIVES the palette from the core
      on every read, so a hand-edited blob cannot ship arbitrary keys and
      stored palettes cannot drift from the current derivation
- [x] Tests: derivation invariants (only palette names, legible intent inks,
      dark-board number re-derivation), sanitisation, storage caps, minting,
      `custom:` round-trip, no-flash stamping incl. smuggling attempts;
      server id/blob validation, upsert, cap-vs-update, cascade. 680 server +
      279 client + ui-smoke green; the full editor loop verified in a real
      browser (create → live preview → save → reload no-flash → switch away
      → delete-active fallback)

**Deviation from sketch:** "~15 editable palette entries" became 9 core
colours + full derivation — fewer knobs, more coherent output, and the
derived palette is the only thing that ever reaches a style attribute.

### Phase 6 — Stats & profile page ✔ Done 2026-08-02

- [x] `server/data/statsRepo.js`: ONE transaction per result — the result row,
      the recent-window prune (50), the aggregates read under `FOR UPDATE`
      (two same-player results serialise; different players never wait), and
      a keep-if-faster board best. Rollback on any failure, so an aggregate
      can never disagree with its rows
- [x] Four terminal sites wired via `utils/statsRecorder` (socket →
      `socket.data.user`, best-effort, guests skipped silently, Postgres
      failures logged and dropped — never on the game path): co-op win
      (`checkWin`), co-op loss (`game/coop.js`), a DECIDED PVP race (winner
      and loser both; disconnect forfeits deliberately record nothing — that
      game was never played out), and a finished daily attempt — at the
      finish, not the submit, so the private profile counts games whether or
      not a score is published
- [x] Co-op records the room's `players` count; board keys derived from the
      board itself (dimensions + counted mines — trap #10, never labels)
- [x] Daily tie-in: a signed-in submit stores the ACCOUNT display name on the
      leaderboard (normalised through the same stored-name gate); the
      anonymous path is untouched. Landed via `socket.data.user` at the
      handlers rather than writing userId onto the Redis attempt — one less
      piece of state, same outcome (deviation noted)
- [x] `user_board_bests` server-side, alongside localStorage `bestTimes`
      (guests keep theirs untouched)
- [x] Guest import: a button on `/profile` when this browser holds records —
      keep-if-faster upsert, so importing can only improve a profile and
      re-importing is harmless; client-reported numbers accepted knowingly
      for a PRIVATE profile
- [x] `/profile` (noindex, own-account only): per-mode games/wins/win-rate,
      the day-streak (current + best), best-times table, recent-games table
      with a W/L strip as the trend; signed-out invite, unavailable + retry
      states; reachable from the account dialog and /settings
- [x] Streak: `server/domain/streak.js`, pure — UTC days as strings (pg's
      `date`→local-Date parsing is the exact trap avoided), same-day
      idempotent, gap resets keeping best, month/year/leap boundaries tested,
      and an out-of-order older result can never destroy a live streak
- [x] Tests: streak table-driven; transaction atomicity + rollback + prune +
      keep-if-faster against a fake pool client; recorder gate matrix;
      import validation; daily account-name override; profile page states.
      `scoringParity.test.js` untouched and green. 705 server + 284 client +
      ui-smoke green. Live: an AUTHENTICATED socket played a real co-op game
      against a real Postgres — result row, aggregates and streak landed;
      import + keep-if-faster + GET /api/stats + account-deletion cascade all
      verified over REST

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
| No rate limiting on `/api` | JWT verification is the only throttle today; the import endpoint is bounded (100 entries) and everything requires auth. Revisit with real traffic — an express-rate-limit on `/api` is a one-file change. Flagged at review (2026-08-02). |

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
| 2026-08-02 | Phase 4 complete: sound synthesised with Web Audio (no asset files — nothing to license or load), off by default, gated in playSound with a first-gesture unlock; wired at the emit helpers (reveal/flag/unflag/chord, room + daily), cascade detection in applyCellUpdates (>8 newly-open cells), and all seven win/lose terminal sites. DS Slider built as its Phase-2-deferred consumer arrived; Sound panel with toggle + volume + Preview. UI clicks cut, music deferred (recorded in the phase). 663 server + 259 client + ui-smoke green; Preview verified through an unlocked context in a real browser. |
| 2026-08-02 | Phase 5 complete: theme editor as nine core colours + full palette derivation (contrast-aware inks, cursor mixes, number fallback); custom themes applied as :root inline overrides with residue-free switching; `custom:` ids through the sanitiser and no-flash script (palette-layer names + hex only); ThemeStudio with live whole-page preview and legibility audit, save-anyway allowed; `user_themes` CRUD with cap-gates-new-only and a merge (not server-wins) at sign-in. 680 server + 279 client + ui-smoke green; the full editor loop verified live in the browser, server CRUD + cascade against real Postgres. |
| 2026-08-02 | Post-review hardening (manager review of PR #97, fixes 1–7): click sounds gated on local board state so refused actions stay silent; the floating footer cluster is root-route-only (it had shipped overlapping /profile after being fixed on /settings); theme deletions tombstone locally and replay at sign-in so an offline delete cannot resurrect; a 60s identity cache removes the per-request users upsert (rename/delete update it in place); the daily submit re-reads the account name so a mid-session rename or deletion never carves a stale name into the leaderboard; user_stats is seeded before FOR UPDATE so first-ever concurrent results serialise; express.json moved to server.js so registration order stops being load-bearing; RECENT_WINDOW named on the client; verify:deploy now checks the /api surface is mounted. 708 server + 290 client + ui-smoke green. |
| 2026-08-02 | Phase 6 complete — and with it every phase: stats tables + one-transaction recordResult (prune, FOR UPDATE aggregates, keep-if-faster bests), pure UTC streak module, four game-end sites wired best-effort through statsRecorder (PVP forfeits excluded; daily records at finish, not submit), daily leaderboard shows account names, /profile dashboard with the guest best-times import. 705 server + 284 client + ui-smoke green. Live: an authenticated socket played a real game and the row, aggregates and streak landed in a real Postgres; import, GET /api/stats and the deletion cascade verified over REST. The PRD's two manual steps (Heroku Postgres, OAuth apps) are all that separate this branch from shippable. |
| 2026-08-07 | Profile-access redesign: signed in, the footer user icon links straight to /profile (tinted `UserSignedInIcon`); the account dialog is sign-in-only. Rename, sign-out and privacy moved to an Account panel on /profile (`app/profile/AccountPanel.tsx`); deletion demoted to a muted link at the page's foot, and its confirm dialog only arms once the display name is typed back. /settings' account section links to /profile instead of opening the dialog. |
