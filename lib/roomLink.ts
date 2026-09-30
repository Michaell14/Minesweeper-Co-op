/**
 * Shareable room-join links. Room codes are arbitrary user text with no charset
 * restriction, so this goes through URL/URLSearchParams rather than hand-rolled
 * encoding.
 */

export const ROOM_QUERY_PARAM = 'room';

/** Existing rooms may have codes longer than our generated two-word codes. */
export const MAX_JOIN_ROOM_CODE_LENGTH = 100;

/** Accept a pasted invite URL or a code, preserving case and internal spaces. */
export function parseRoomInput(input: string): { room: string } | { error: string } {
    let room = input.trim();
    if (/^https?:\/\//i.test(room)) {
        try {
            const url = new URL(room);
            const fromLink = url.searchParams.get(ROOM_QUERY_PARAM);
            if (fromLink === null) return { error: 'This link does not contain a room code.' };
            room = fromLink.trim();
        } catch {
            return { error: 'Enter a room code or a valid invite link.' };
        }
    }
    if (!room) return { error: 'Enter a room code or paste an invite link.' };
    if (room.length > MAX_JOIN_ROOM_CODE_LENGTH) {
        return { error: `Room codes must be ${MAX_JOIN_ROOM_CODE_LENGTH} characters or fewer.` };
    }
    return { room };
}

/** An absolute URL that, when opened, auto-fills and offers to join this room. */
export function buildJoinUrl(room: string): string {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set(ROOM_QUERY_PARAM, room);
    return url.toString();
}
