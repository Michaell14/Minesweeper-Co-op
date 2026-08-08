/**
 * The "start playing now" daily link.
 *
 * /daily has to serve two arrivals that want opposite things. Someone who
 * pressed a button reading "Play Today's Puzzle" has already chosen, and the
 * intro is then a second identical button in their way. Someone arriving from a
 * search result has chosen nothing — and starting an attempt CONSUMES the day's
 * one attempt even if they never make a move (see the comment on the fresh
 * attempt in server/controllers/dailyController.js), so it cannot be done on
 * spec. The intent travels in the URL rather than being guessed at.
 *
 * Mirrors lib/roomLink.ts, including the one-shot strip once it is consumed.
 * `/daily` stays the canonical URL, so nothing here is indexable.
 */

export const DAILY_PLAY_PARAM = 'play';

/** Link target for controls that mean "play, now" rather than "tell me about it". */
export const DAILY_PLAY_HREF = `/daily?${DAILY_PLAY_PARAM}=1`;

/** Whether this page load was asked to start an attempt straight away. */
export function wantsImmediatePlay(): boolean {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get(DAILY_PLAY_PARAM) === '1';
}

/**
 * Drops the param once acted on, so a refresh or a bookmark of what is now just
 * the daily page does not silently re-trigger a start.
 */
export function clearImmediatePlay(): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete(DAILY_PLAY_PARAM);
    window.history.replaceState(null, '', url.toString());
}
