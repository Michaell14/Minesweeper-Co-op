/**
 * "I pressed play" — carried from the front page to /daily.
 *
 * /daily serves two arrivals that want opposite things. Someone who pressed a
 * button reading "Play Today's Puzzle" has already chosen, and meeting them
 * with the intro is a second identical button in their way. Someone arriving
 * cold has chosen nothing — and starting CONSUMES the day's one attempt even
 * if they never make a move (see the fresh-attempt branch in
 * server/controllers/dailyController.js), so it cannot be done on spec.
 *
 * This deliberately is NOT a URL parameter. A `?play=1` link is public: anyone
 * could post one, and clicking it would spend the reader's only attempt for the
 * day before they saw anything — the exact harm the intro exists to prevent,
 * just moved somewhere harder to notice. Intent has to come from a gesture in
 * this tab, which a link cannot forge.
 *
 * Module state, like `inFlightRecord` in lib/dailyIdentity.ts: it survives the
 * client-side navigation between the two routes, is per-tab, and is gone on a
 * reload — so a stale intent cannot outlive the click that set it. Consumed on
 * read, so it can only ever start one attempt.
 */

let pending = false;

/** The modifier keys that mean "not this tab" — see `markPlayIntent`. */
interface ActivationEvent {
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
}

/**
 * Records that this tab's player asked to play, if the click was a plain one.
 *
 * A cmd/ctrl/shift click opens a NEW tab, whose module state starts empty — so
 * that tab correctly shows the intro, and recording here would leave the flag
 * set in THIS tab to fire on some later, unrelated visit to /daily.
 */
export function markPlayIntent(event: ActivationEvent): void {
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    pending = true;
}

/** Whether to start immediately. Always clears, so it cannot fire twice. */
export function consumePlayIntent(): boolean {
    const wanted = pending;
    pending = false;
    return wanted;
}
