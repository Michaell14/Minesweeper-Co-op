/**
 * "I pressed play", carried from the front page to /daily. Someone who pressed
 * "Play Today's Puzzle" has already chosen; someone arriving cold has not, and
 * starting CONSUMES the day's one attempt (server/controllers/dailyController.js).
 *
 * NOT a URL parameter: a `?play=1` link is public, and clicking it would spend
 * the reader's only attempt before they saw anything. Intent has to come from
 * a gesture in this tab. Module state, like `inFlightRecord` in
 * lib/dailyIdentity.ts: survives client-side navigation, per-tab, gone on
 * reload. Consumed on read, so it can only start one attempt.
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
 * Records that this tab's player asked to play, if the click was plain. A
 * modifier click opens a NEW tab with empty module state, and recording here
 * would leave the flag set to fire on a later, unrelated visit.
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
