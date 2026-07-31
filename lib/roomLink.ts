/**
 * Shareable room-join links.
 *
 * Room codes are arbitrary user text with no charset restriction (see
 * server/validation.js), so building/parsing goes through URL/URLSearchParams
 * rather than hand-rolled encoding -- they percent-encode and decode for us.
 */

export const ROOM_QUERY_PARAM = 'room';

/** An absolute URL that, when opened, auto-fills and offers to join this room. */
export function buildJoinUrl(room: string): string {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set(ROOM_QUERY_PARAM, room);
    return url.toString();
}
