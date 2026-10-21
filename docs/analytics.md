# Using analytics to improve Minesweeper

## What we can establish today

The app already mounted Vercel Web Analytics in its root layout. Before this
change, there were no custom events: page visits could show interest in
`/daily` or `/drills`, but could not distinguish creating a co-op room from
joining one, choosing PvP, completing a game, or abandoning matchmaking.
The user subsequently supplied dashboard screenshots for the last 30 days.
See [the screenshot-based review](analytics-review.md) for observations and the
changes they informed. Page views still cannot establish satisfaction or
individual game outcomes.

## Enable and verify collection

1. In the correct Vercel project, open **Analytics** and confirm Web Analytics
   is enabled. Check that your plan supports custom events; installing the SDK
   and having page views does not establish that custom-event collection is
   included. See [Vercel custom events](https://vercel.com/docs/analytics/custom-events).
2. Deploy this change through the normal review/release workflow. No API key or
   additional analytics service is required for the existing Vercel integration.
3. On that deployment, create a room and reveal a cell; change one setting;
   start and cancel a quick match; try a drill. Confirm the corresponding
   event names and properties appear under Analytics → Events. Browser
   blockers and project/plan settings can prevent ingestion even when local
   tests pass. Events are new data and cannot reconstruct past usage.
4. Use a consistent period (initially 14–30 days), keep release dates in view,
   and compare device and traffic-source segments where the dashboard permits.
   Exclude your own verification sessions where supported.

## Event reference

| Event | Meaning and useful properties |
| --- | --- |
| `play_requested` | An action reached the socket emit: `create`, `join`, `quick_match`, `practice`, or `daily`. Not a successful game. Re-queueing the same pending search does not create another request. |
| `play_result` | Resolution of that request: `entered`, `resumed`, `cancelled`, `practice` (switch from matchmaking), `error`, or `already_played`. Wait is bucketed as `<1s`, `1-4s`, `5-14s`, `15-29s`, or `30s+`. Fresh room entry includes actual mode, dimensions, mines, and rules. |
| `game_started` | A live room clock starts for an already joined player. Daily starts wait for a server response to the first valid move. Board metadata distinguishes co-op, PvP, practice, daily, standard and sudden-death rules. |
| `game_finished` | A measured start reaches `won`, `lost`, or `opponent_left`. Duplicate outcomes and terminal snapshots do not count. |
| `setting_changed` | A changed preference chosen through `setSetting`, not hydration/account sync. Captures the setting and new value. Custom palettes are grouped as `custom`; slider volume and seasonal dismissal metadata are omitted. |
| `room_link_share` | Clipboard copy succeeded (`copied`) or manual fallback was displayed (`manual_fallback`). Neither proves a friend received the link. |
| `drill_used` | First interaction, hint use, or solving a drill. Uses authored lesson/drill IDs; solves include mistake and hint counts. Loading a lesson alone is not a start. |
| `connection_problem` | Transition into `unreachable` or `reconnecting`. Repeated errors while in the same state do not generate another event. |

These are **per-client events**, not counts of distinct people or server games.
Two co-op players can each contribute a start and finish. A closed tab produces
no guaranteed cancellation event. Reloads/reconnects and mid-game joiners are
deliberately excluded from new starts; a resumed game's finish is excluded too.
Therefore starts minus finishes is an indication of incomplete observed play,
not an exact abandonment rate. Board preferences describe entered rooms,
including rooms chosen by a host rather than by their guests.

## Decisions to make from the data

| Question | Compare | Candidate improvement if supported |
| --- | --- | --- |
| Are people reaching a playable board? | Requests vs entered results by action; wait buckets; connection problems. | Improve slow joins, backend availability, or the name/join flow before adding features. Missing results also include closed tabs and blocked telemetry. |
| Is quick match losing players? | Matched entries vs cancellations and switches to practice, by wait bucket. | Make solo practice easier to discover or improve opponent availability. |
| Which configurations get used? | Entered modes, board dimensions/mines and rules; observed finishes. | Promote popular choices or simplify less-used controls after checking discoverability. |
| Are players finding the game too difficult? | Observed losses by configuration, plus use/completion of drills and hints. | Improve beginner guidance or suggest a relevant lesson after a loss. |
| Is cooperative sharing working? | Copy successes, manual fallbacks, and join requests/results. | Improve clipboard fallback or joining instructions. No room identifier is collected, so these cannot be linked into an invite conversion funnel. |
| Which preferences matter? | Settings deliberately changed; which ones are turned off. | Revisit confusing defaults, mobile controls, and distracting effects. Defaults are not reported as active choices. |

Low usage alone does not mean dislike: a feature can be hidden, irrelevant to a
traffic source, or working well with its default. Page exit or long time on a
game page is similarly ambiguous. Test one focused change at a time, compare
equivalent periods and audience segments, and use player feedback to interpret
the numbers. Avoid building a large feature solely from a small event count.

## Concrete reliability improvement included

Inter and Press Start 2P now ship in pinned Fontsource packages and load through
`next/font/local`, retaining local serving, preload, CSS variables and the
existing display behavior. This removes the Google Fonts network dependency
that caused the initial production build to fail in the cloud environment.
It is a demonstrated build reliability fix, not a measured page-speed claim.

## Privacy and validation

Event properties are explicitly constructed. No player names, room codes,
socket IDs, account IDs, attempt tokens, raw server errors or custom palette
names are sent. The Vercel `beforeSend` hook strips query strings and fragments
from page/event URLs and suppresses `/api/` events. This also removes URL query
campaign parameters; built-in Vercel reporting may handle acquisition
separately. The privacy dialog describes feature measurement.

Use `npm run test:client` for event contracts, replay/duplicate suppression,
settings behavior and URL sanitization, then `npm run test:ui` against the local
stack for gameplay regression checks. Local validation does not prove that the
production Vercel project accepts events. Verify ingestion after deployment.
