# Analytics review — October 20, 2026

Source: the four Vercel screenshots supplied by the user. The overview shows
Production / Last 30 Days. Comparisons between panels assume the same filters;
no raw sessions, device breakdown, game events, or private dashboard access
were available. Values shown as `K` are rounded.

## What the data supports

The site has **2,762 visitors (+44%)** and **6,469 page views (+45%)**, about
**2.34 views per visitor**. Traffic and views are growing at a similar rate.
The screenshot reports **59% bounce**, down 3%. A page-level bounce does not
establish an unsuccessful game: the primary experience runs on one route.
Use measured game starts and outcomes before changing gameplay to chase bounce.

| Destination | Visitors | Views | Interpretation |
| --- | ---: | ---: | --- |
| Home | ~2,400 | ~4,200 | The main surface for improvements; route analytics cannot distinguish co-op, PvP or practice here. |
| Daily | 564 | 932 | The largest secondary destination. Keep its existing prominent entry and direct route. No evidence here calls for a redesign. |
| How to play | 186 | 210 | Rules are being sought out. A single visit can answer a question; low repeat views are not a failure signal. |
| Drills index | 120 | 407 | About 3.39 views per visitor; a useful candidate for easier discovery and continuation. |
| Drill lessons | 99 | 370 | About 3.74 views per visitor across the grouped dynamic route. This can include different lessons and refreshes; it is not proof of return visits or completion. |
| Settings | 102 | 156 | Some visitors customize, but page views do not identify preferred settings. |
| Profile | 27 | 30 | A low-traffic destination in this window. Guest play is supported, so this does not prove accounts are disliked or broken. |

Visitors can appear on several routes. Do not add route visitors to estimate
site visitors, or interpret the route panel's percentages as adoption among
all 2,762 visitors. The dynamic `/drills/[lesson]` row also cannot tell us which
individual lessons are most popular.

## Acquisition

Google accounts for 595 visitors (54% of the displayed referral breakdown),
and Bing for 137 (12%). Search is an important acquisition channel. Those
percentages refer to the referral panel, not all site visitors; direct or
unattributed traffic is not established by this screenshot.

The Microsoft Teams-related hostname has 120 attributed visitors and 233
views. This supports keeping room sharing easy, but the hostname alone cannot
tell us how many people played or distinguish link previews from players.
The existing room copy/fallback and join-link workflows already have browser
coverage. Search entry pages should continue to offer immediate guest play,
clear rules and relevant practice links.

## Changes and priorities

1. **Keep the homepage compact.** Daily and Quick Match retain their existing
   prominent controls. Practice stays accessible through the existing Drills
   navigation. Drill traffic makes learning a useful area to measure before
   adding more homepage controls; existing drill-start and solve events can
   inform improvements within the catalog and lessons.
2. **Reduce repeated guest auth requests.** The token endpoint returns 401
   intentionally when there is no signed-in session. The client previously
   retried on every uncached token lookup. It now remembers a guest response
   for 60 seconds in memory, then checks again. Network errors and 503s remain
   immediately retryable. Clearing auth state removes the cooldown and
   invalidates old in-flight responses, so a late result cannot restore a
   signed-out account. The endpoint still enforces authentication; the first
   request and new page loads can legitimately show 401s.
3. **Measure the missing actions.** The earlier custom events distinguish
   requested play from confirmed entry, live starts/outcomes, mode and board
   choices, matchmaking waits, settings changes, sharing and drills. They are
   needed before deciding which game modes or controls to expand or remove.

The log's 200 responses are successful; 304 responses are normal cache
validation. The shown 401s alone do not establish OAuth failure, Redis failure,
or an unavailable game server. Those diagnoses require the corresponding
authenticated request or backend evidence.

The `/undefined` and malformed Markdown-looking route each have one visitor
and one view. Inspection found no matching hardcoded internal link. Keep them
as a low-volume issue to monitor; their source is unknown, and adding broad
redirects would conceal the symptom without identifying its cause.

## What to check after release

Verify custom-event ingestion and plan support in Vercel as described in
[analytics.md](analytics.md). Compare equivalent periods with the same filters:
drill starts/solves, play requests/entries, and guest
token-request volume. The screenshots are the pre-release baseline, not
evidence that the changes improved outcomes.

If search traffic grows but successful play does not, prioritize landing-page
clarity and join latency. If matchmaking cancellations rise with wait time,
prioritize its practice fallback or opponent availability. If Daily remains
the strongest secondary destination, investigate measured starts, losses and
sharing before choosing its next feature. Obtain device and performance data
before making mobile or page-speed claims. Avoid spending heavily on new
account features solely from this small profile-page count.
