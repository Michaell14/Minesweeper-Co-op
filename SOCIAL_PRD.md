# PRD: Social — Emotes, Pings & Friends

**Status:** Phases 1–2 (emotes, pings) done 2026-08-22 · Phases 3–5 proposed · **Owner:** Michael · **Created:** 2026-08-21

A living document, same contract as `USER_PROFILES_PRD.md`: each phase has a
checklist; check items off as they land and update the phase status line. The
*Decisions* table in §2 is **proposed, not settled** — confirm it before Phase 1
starts, and if a decision changes later, edit it here first and the code second.

---

## 1. Summary

Co-op is the mode this game is named for, and today two people share a board
with almost nothing to say to each other. The room protocol has exactly two
expressive events: `emitConfetti` (fires for everyone, carries no sender) and
`cellHover` (a cursor, cell-snapped). There is no way to react to what someone
did, no way to point at a cell, and no way to play with the same person twice
without re-sharing a room code out of band.

This PRD covers two features that address that, in dependency order:

1. **Quick emotes and board pings** — a fixed vocabulary of six reactions and a
   "look here" marker on a cell. Ephemeral, room-scoped, no storage, works for
   guests. Roughly the same shape as confetti and hover, which is why it comes
   first.
2. **Friends** — an accepted-both-ways graph on top of the accounts that already
   exist, plus presence and a direct invite that replaces copy-pasting a room
   code. Needs Postgres and an account; guests are unaffected.

The unifying decision is **no free text anywhere**. A fixed vocabulary of
drawn glyphs is expressive enough for a two-to-eight person puzzle game and
carries no moderation surface, no profanity filter, no i18n, and no report flow
— none of which this project has anyone to staff. Everything below follows from
that.

## 2. Decisions (proposed — confirm before Phase 1)

| Question | Proposal | Notes |
|---|---|---|
| Expression vocabulary | **Six fixed emotes, drawn as pixel art** | No free text, ever. No custom/uploaded emotes. See §4.1 for the six. |
| Who can emote | **Everyone, including guests** | Emotes are room state, not account state. Requiring sign-in would gut the feature — most players are anonymous. |
| Emotes in PVP | **Allowed** | They carry no board information. Racers can still taunt. |
| Pings in PVP | **Suppressed, like hover** | PVP is the *same board* per player (CLAUDE.md trap #7) — a ping is a legal move-hint straight to your opponent's screen. Same reason `cellHover` returns early on `mode === 'pvp'`. |
| Emotes/pings in the daily | **Not offered** | The daily is not a room and has nobody to broadcast to (trap #9). |
| Receiving is opt-out | **`settings.emotes`, default on** | Precedent: `confetti` and `shareCursor` are already receive/send toggles in `lib/settings.ts`. |
| Rate limiting | **One shared token bucket for emotes + pings** | Separate buckets would let a client alternate the two and send at double the intended rate. Reuses `server/domain/rateLimit.js`. |
| Adding a friend | **By friend code, plus "players from your last game"** | Not by display-name search. Names are not unique and `USER_PROFILES_PRD.md` deliberately deleted name-uniqueness and public profiles; name search would reintroduce both, plus enumeration and harassment. |
| Friend graph shape | **Mutual, both sides accept** | Not follows. A one-way edge that can invite you into a room is a spam primitive. |
| Presence | **Derived from live sockets, never stored** | Same scan pattern as `utils/statsRecorder.js`; nothing to prune on disconnect. |
| Invites | **Only from accepted friends, rate-limited per pair** | This is the whole anti-spam design; there is no other inbound channel to a stranger. |
| Friend data on game paths | **Best-effort, like every other Postgres write** | A database outage must not slow or break a game. Only the friends UI itself may fail visibly. |

## 3. Goals / Non-goals

**Goals**

- React to what just happened in a shared room, in under a second, without
  typing.
- Point at a cell — the single most common thing two people playing one board
  need to do and currently cannot.
- Play with the same person again without leaving the site to send them a code.
- See which friends are online and joinable right now.
- Guests keep every bit of expression; only the friend graph needs an account.

**Non-goals**

- Chat, of any kind: no free text, no canned phrase *sentences*, no voice.
- Public profiles, friend counts as a status number, or a social feed.
- Friends-only leaderboards (deliberately deferred — see §8).
- Cross-room presence beyond "online / in a game / idle".
- Emote inventory, unlocks, or shop. Achievements already own progression, and
  gating an emote behind an unlock makes the vocabulary non-uniform for no
  gain.
- Persisting anything about an emote or ping. They are frames, not records.

## 4. Architecture

### 4.1 Emotes and pings — ephemeral, no storage

Nothing here touches Redis. The server's whole job is authorisation and fan-out,
which is what makes this the cheap half of the PRD.

```
Player A                          Server                          Players B..N
   │  emote { room, id } ──────────►│
   │                                ├─ bucket (shared, socket.data)
   │                                ├─ isValidRoomCode / isValidEmoteId
   │                                ├─ room exists? player exists? in room?
   │                                ├─ playerRepo.getName
   │◄──────── playerEmote { id, name, emote } ──────────────────►│
   │                                                             │  ~1.4s float+fade
   │  pingCell { room, row, col } ─►│  (+ mode !== 'pvp')
   │◄──────── playerPing { id, name, row, col, color } ─────────►│  ~2s ring at cell
```

Both emit with `io.to(room)` rather than `socket.to(room)` — unlike hover, the
sender should see exactly the artefact everyone else sees, at the same moment,
and confetti already sets that precedent. The handler body follows `cellHover`'s
established order, which exists for reasons worth restating: **rate limit first,
before anything touches Redis**, and **every refusal is a silent drop** — never
an error emit, never a disconnect.

**The six emotes.** Chosen to be drawable at 16x16 and to cover what actually
gets said over a shared board: **wave** (hi / good game), **thumbs-up** (nice
one), **question mark** (I'm not sure), **mine** (careful, I think that's a
bomb), **clock** (hurry / we're slow), **heart** (thanks). The mine and heart
already exist as art — the default mine sprite and the Valentine's heart mine — so
half the set is a re-cut rather than a new drawing.

Art lives beside the rest: 16x16 character grids in the `pixelArt.ts` renderer's
format, painted in **tokens, not literal hex**, because an emote appears on all
twelve palettes plus custom ones (CLAUDE.md trap #11 — the same reason general
sprite sets are token-drawn and only seasonal pairs may use literals).

**Rendering.** An emote appears as a chip in a short feed directly above the
tray, carrying the sender's name. *(Drafted as a badge on the sender's
`ScoreTable` row; that was wrong — PVP hides the score table entirely, so there
is no player list common to both modes. The feed travels with the tray instead,
which is one mount and works in every mode and breakpoint.)* A ping is a ring
drawn at the cell by a sibling of `CursorLayer`, reusing `useCellMetrics` for
the same cell-to-pixel maths — the ping is cell-snapped for exactly the reason
hover is.

**Input.** Sending is a tray of six buttons next to the board controls. Pings
need a gesture that does not collide with left-open, right-flag, or
both-buttons-chord — proposed **Alt/Option + click** on desktop, and on touch,
arming ping from the tray then tapping one cell (a one-shot mode, not a
persistent one). With `keyboardControls` on, ping the keyboard cursor's cell
from the tray or a hotkey. **Both bindings need verifying against the existing
handlers before Phase 2 commits to them** — see §8.

**Motion, sound, a11y.** The float-and-fade and the ring read `--ms-duration-*`
tokens, so `prefers-reduced-motion` zeroes them like everything else. One
synthesised blip per received emote via `lib/sound.ts`, gated on
`settings.sound` as usual. `CursorLayer` is `aria-hidden`, so pings and emotes
need their own polite live region — "Alex pinged row 4, column 7" — or they are
invisible to a screen reader rather than merely decorative.

### 4.2 Friends — accounts, Postgres, and a socket for presence

```
/profile ──► GET /api/friends ──► friendships JOIN users ──► list + presence
   │                                          ▲
   │  POST /api/friends { code } ─────────────┘   (by friend code)
   │  PUT  /api/friends/:id { action }            (accept | decline | block)
   │  DELETE /api/friends/:id
   │
Room ──► inviteFriend { friendUserId, room } ──► verify accepted friendship
                                                 → friendInvite to their live sockets
```

REST rides the surface `profileController` already established: `requireUser`,
JSON in and out, `socket.data.user` for the socket half. Three points are
specific to this repo:

- **Presence is a scan of `io.sockets`, and must not become a socket room.**
  `statsRecorder.js` documents why: room codes are arbitrary player-typed
  strings, so `socket.join('user:<uuid>')` shares a namespace with the join box
  — anyone who knew a victim's id could create that room and receive their
  traffic. The friend cap keeps the scan bounded.
- **Presence is pushed, not polled**: on connect and disconnect, resolve that
  user's accepted friends and notify whichever of their sockets are live. At a
  100-friend cap this is one indexed query and a bounded scan per session edge.
- **Invites are the only inbound channel from another person**, which is why
  they require an accepted friendship, a live room with space, and a
  per-pair cooldown. A blocked user's invite is dropped silently, not refused.

## 5. Data model (Postgres)

Two migrations via `node-pg-migrate`, run from `heroku-postbuild` like the seven
already in `server/migrations/`. Both are additive and safe one release back.

| Table / column | Contents |
|---|---|
| `users.friend_code` | 8 chars from an ambiguity-free alphabet (no O/0/I/1), unique, generated on first read rather than backfilled. ~40 bits — not secret, but not walkable either. |
| `friendships` | `id`, `requester_id`, `addressee_id`, `status` (`pending` \| `accepted` \| `blocked`), `created_at`, `responded_at`. Unique on (`requester_id`, `addressee_id`), `CHECK requester_id <> addressee_id`, index on both id columns. |

One row per relationship, direction preserved so a pending request knows who
asked. "My friends" is the union of both directions with `status = 'accepted'`.
A block is stored on the blocker's row and suppresses invites, presence and
re-requests in both directions.

Caps, enforced in the repo layer, not the route: **100 friends**, **20
outstanding outbound requests**. Deleting an account cascades, same as every
other table added by `USER_PROFILES_PRD.md`.

## 6. Repo-specific constraints (read before building)

1. **A new socket event touches four places** — `shared/events.js`,
   `shared/socketPayloads.ts` (keyed by the event *value*), the server handler,
   and the client table in `hooks/useGameEvents.ts`. `server/tests/events.test.js`
   fails on drift. Don't unfreeze the event objects.
2. **Handlers register in the `useGameEvents` table, never via `socket.on` in a
   component** — registration and cleanup are derived from the table.
3. **Server layering is enforced** by `tests/layering.test.js`. The rate-limit
   constants belong in `domain/` (pure), the friends queries in `data/`, the
   friend/presence orchestration in `utils/` or `controllers/`, and nothing may
   import upward or cycle.
4. **`shared/` must stay pure** — the emote catalog goes there (both halves need
   it: the client draws the tray, the server validates the id), and the layering
   test cannot catch a `shared/` module that grows I/O.
5. **No locks needed.** Emotes and pings read nothing they write, and the
   friendship writes are single-row Postgres statements. Don't reach for
   `withActionLock`.
6. **Build the tray, dialogs and friend list from `components/ds/`**, and open
   dialogs through `lib/dialogs.ts` ids with `<DialogClose>` for dismissal.
7. **No raw colours, sizes or durations.** Emote art in palette tokens, motion
   in `--ms-duration-*`.
8. **Postgres is best-effort on game paths.** A friends query must never sit in
   front of a board update.
9. **Guests must not regress.** Phase 1 and 2 ship with no account check at all.

## 7. Phases

Sized so each is independently shippable and independently revertable. Phases 1
and 2 have no database dependency, so they can land while the Heroku Postgres
and OAuth steps outstanding from `USER_PROFILES_PRD.md` are still pending.

### Phase 1 — Emotes ✔ Done 2026-08-21

- [x] `shared/emotes.js` — six ids, labels, frozen; imported by both halves.
      Hello, Nice, Not sure, Careful, Hurry, Thanks.
- [x] Art: six 16x16 grids in `components/ds/emoteArt.ts`, token-painted
      (ink / opened-cell / mine accent, the avatars' three), on `/ds`.
- [x] `SEND_EMOTE` client event + `PLAYER_EMOTE` server event, all four places.
- [x] `isValidEmoteId` in `server/validation.js`.
- [x] Shared expression bucket in `server/domain/rateLimit.js` (1/s sustained,
      burst 3) on `socket.data.expressionBucket`.
- [x] Handler in `server.js` mirroring `cellHover`: bucket → validate →
      membership inline → name → `io.to(room)`. Silent drops throughout.
- [x] Client: tray under the board, mounted once for both layouts; a feed of
      the last three reactions above it; polite live-region announcement.
- [x] `settings.emotes` (receive) in `lib/settings.ts` + `/settings` toggle +
      sanitiser default.
- [x] Sound on receive, gated on `settings.sound`.
- [x] Tests: 23 server (validation, rate limit, membership, PVP allowed, free
      text refused), 26 client (art invariants, tray by accessible name, the
      receive gate, feed expiry, announcement wording), and a two-client
      EMOTES scenario in `scripts/ui-smoke/`.

**Two things this phase settled that the draft had wrong.** The feed cannot ride
on `ScoreTable` (see §4.1). And the chip's lifetime cannot be a
`--ms-duration-*` token: that media query zeroes them under
`prefers-reduced-motion`, which would silently deliver *no message* to anyone who
asked for *no motion*. It is a plain timer in `lib/emotes.ts`, with the
float-and-fade layered on top as the part that may be zeroed.

### Phase 2 — Board pings ✔ Done 2026-08-22

- [x] Bindings verified and chosen — **Shift+click** on desktop, a one-shot
      **arm** from the tray for touch, **P** on the keyboard cursor's cell.
      *Alt was rejected*: free in this codebase, but Linux window managers
      commonly grab Alt+click to move a window, so the page may never see it.
      Ctrl is the macOS secondary click, which is already the flag. A keyboard
      modifier was never available — `useKeyboardControls` drops every
      keystroke carrying Ctrl, Meta or Alt.
- [x] `PING_CELL` + `PLAYER_PING` events, all four places.
- [x] Handler on the Phase 1 bucket with the **`mode === 'pvp'` early return**,
      and a test that fails without it. Validates with `isValidCoordinate`, not
      `isValidHoverCoordinate` — the `-1,-1` clear is hover's, and a ping has no
      such state.
- [x] `PingLayer` beside `CursorLayer`, sharing `useCellMetrics`; ring + name in
      the sender's cursor colour, ~2s, token-driven, announced in its own live
      region.
- [x] Tests: 14 server (PVP suppression beside the emote that is allowed from
      the same room, coordinate bounds, the bucket shared across both events),
      22 client (interception across all four of Cell's branches, the hotkey,
      the arm's one-shot disarm, ring expiry, announcement wording), and the
      smoke scenario extended.

**The interception is on the grid, not in `Cell`.** Cell has four render
branches acting from four different handlers, so a modifier check per branch is
four chances to miss one — and a missed branch means a ping that opens the cell
it points at. One capture listener on the grid sits ahead of all of them, reads
`data-row`/`data-col`, and hooks **mousedown** because the opened-cell branch
acts on mouse up.

**One bug worth recording.** The mouseup and click that follow were swallowed by
re-asking "is a ping armed?" — but the arm is one-shot and clears the moment the
ping is sent, so by mouseup the answer had changed: the ping fired *and* the cell
opened under it. The tail of the gesture now runs off a latch. The smoke suite
caught it; the unit test had not, because its mock `pingCell` never disarmed
anything the way the real action does. That mock now disarms, and the test fails
without the latch.

### Phase 3 — Friend graph

- [ ] Migrations: `users.friend_code`, `friendships`.
- [ ] `server/data/friendsRepo.js` — request, accept, decline, block, remove,
      list-with-caps. Direction-preserving, cap-enforcing.
- [ ] `server/controllers/friendsController.js` — the four routes under
      `requireUser`.
- [ ] `lib/friendsApi.ts` + a Friends panel on `/profile` beside
      `AchievementsPanel`, showing avatars from `shared/avatars.js`.
- [ ] Friend code shown on `/profile` with copy-to-clipboard.
- [ ] Tests: repo cap and duplicate/reciprocal-request behaviour, block
      semantics, route auth, panel rendering.

### Phase 4 — Presence & invites

- [ ] Presence resolution on connect/disconnect via the `io.sockets` scan;
      **no `user:<id>` rooms**.
- [ ] `FRIEND_PRESENCE` push to a user's friends' live sockets.
- [ ] `INVITE_FRIEND` / `FRIEND_INVITE` events with friendship + room-capacity
      checks and a per-pair cooldown.
- [ ] Invite toast with Join, reusing the achievement toast's presentation.
- [ ] "Invite a friend" entry point in `RoomPanel`, signed-in only.
- [ ] Tests: invite refused for non-friends, for blocks, for a full or missing
      room, and past the cooldown.

### Phase 5 — Recent players (optional)

- [ ] Offer "add friend" for signed-in players you just finished a game with,
      from the game summary — the lowest-friction path onto the graph, and the
      one that decides whether Phase 3 gets used at all.

## 8. Risks & open questions

| Risk / question | Position |
|---|---|
| Emote spam or harassment | Fixed vocabulary, shared bucket, and a receive-side setting. **Open:** a per-player mute inside a room — probably worth it in Phase 1, since the global toggle is a blunt instrument when one person is the problem. |
| A ping leaking board information in PVP | Suppressed at the handler with a test. This is the single most important line of server code in Phase 2. |
| Alt+click already meaning something | Unverified — first checklist item of Phase 2. Fallbacks: a tray-armed one-shot on every platform, or a dedicated modifier. |
| Presence scan cost | O(live sockets) per connect/disconnect, bounded by the friend cap. If concurrency grows past a few thousand, move to a Redis presence set — but not before, and never to a `user:<id>` socket room. |
| Friend-code enumeration | ~40 bits and rate-limited lookups. A code is a handle, not a secret; rotating it should be possible from `/profile` if abuse ever appears. |
| Invites as a spam vector | Mutual-accept plus per-pair cooldown is the whole defence. Do not add "invite by code" without one. |
| Postgres outage | Friends UI fails visibly; games are untouched. Phases 1–2 don't depend on it at all. |
| Guests can't use friends | Accepted, consistent with the accounts PRD. Emotes and pings deliberately land first so the social feature that works signed-out ships first. |
| No moderation capacity | The reason there is no free text. Revisit only with a plan for who reads reports. |
| Measurement | Vercel Analytics is client-side only. Proposal: TTL'd Redis counters for emotes sent, pings sent, invites sent/accepted, so "did anyone use this" is answerable without a new pipeline. |
| Friends-only leaderboards | Deferred, not rejected. It's the natural Phase 6, but it reopens the "no persistent leaderboards" decision from `USER_PROFILES_PRD.md` §2 and deserves its own entry there rather than being smuggled in here. |

## 9. Progress log

| Date | Change |
|---|---|
| 2026-08-21 | PRD drafted. Decisions in §2 proposed, none confirmed; §8 carries three open questions (per-player mute, ping binding, friends leaderboard). |
| 2026-08-22 | Phase 2 complete: `pingCell`/`playerPing` on the shared expression bucket, suppressed in PVP with a test that fails without the guard; grid-level capture interception across all four of Cell's render branches; `PingLayer` rings in the sender's cursor colour; three input paths (Shift+click, tray arm, P). Alt rejected as a binding — Linux window managers grab it. 1114 server + 1396 client tests, lint, tsc and the smoke suite green; verified live in a real browser that the pinged cell is NOT opened by the click that pinged it. Two bugs found by the browser and not the unit tests: the one-shot disarm racing the tail of its own gesture, and this layer's live region shadowing the keyboard cursor's (both now addressed by explicit markers rather than DOM order). |
| 2026-08-21 | Phase 1 complete: six-glyph catalog in `shared/`, token-painted art on `/ds`, the `sendEmote`/`playerEmote` pair through all four places, an expression bucket shared with whatever Phase 2 adds, tray + three-chip feed mounted once under the board, `settings.emotes` as a receive-only opt-out, and a synthesised blip. 1044 server + 1292 client tests, lint, tsc, production build and the full ui-smoke suite green — the new EMOTES scenario exchanges a reaction between two real browsers and watches it expire. Verified live in the browser: one tray in the DOM, all six glyphs resolve their tokens on default, Game Boy, C64 and every seasonal palette, and the live region carries "Emoter: Nice". Corrected two draft assumptions (see the phase). |
