// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useMinesweeperStore } from "@/app/store";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import { boardKey, clearBestTimes, readBestTime, recordBestTime } from "@/lib/bestTimes";
import { useGameEvents } from "./useGameEvents";
import type { AppSocket } from "@/lib/initSocket";

// A win shoots confetti, which wants a real canvas. Nothing here is about the
// flourish, and jsdom's canvas has no 2d context to give it.
vi.mock("@/lib/confetti", () => ({ shootConfetti: vi.fn() }));

/**
 * `sessionResume` — the offer the server makes to a browser it recognises.
 *
 * It arrives on EVERY connect, and the two connects it has to tell apart look
 * nothing alike from the client's side:
 *
 *   a reload      — the tab restarted, so the store is empty and the player is
 *                   sitting on Landing
 *   a reconnect   — socket.io re-dialled after a dropped network, and the tab
 *                   never went anywhere: the room is still on screen
 *
 * Only the first was handled. The second was refused because `playerJoined` was
 * still true, which left the player stranded — the server had already removed
 * them on the disconnect, so the UI showed a room they were no longer in and
 * the next click bounced them home with "room does not exist". The tests below
 * are about the refusal being narrow enough: it must still cover the daily, and
 * still cover an offer for some OTHER room.
 *
 * The handler table is a plain object, so a fake socket and the real store are
 * the whole fixture. It asks for a DOM only because the win handlers below file
 * a personal best, and that is localStorage.
 */

const ROOM = "room-a";
const NAME = "Alice";

const fakeSocket = () => ({ id: "sock-1", emit: vi.fn() }) as unknown as AppSocket;

/** Delivers one `sessionResume` through the real handler table. */
const deliverResume = (socket: AppSocket, payload: { room: string; name: string }) => {
    const handlers = useGameEvents(socket, vi.fn());
    handlers[SERVER_EVENTS.SESSION_RESUME]!(payload);
};

const joinEmits = (socket: AppSocket) =>
    (socket.emit as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([event]) => event === CLIENT_EVENTS.JOIN_ROOM,
    );

beforeEach(() => {
    const store = useMinesweeperStore.getState();
    store.setPlayerJoined(false);
    store.setDailyActive(false);
    store.setRoom("");
    store.setName("");
});

describe("when the browser is not in a room", () => {
    test("takes the offer, by running the ordinary join", () => {
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });

        expect(joinEmits(socket)).toEqual([[CLIENT_EVENTS.JOIN_ROOM, { room: ROOM, name: NAME }]]);
        expect(useMinesweeperStore.getState().room).toBe(ROOM);
        expect(useMinesweeperStore.getState().name).toBe(NAME);
    });
});

describe("when the tab is still showing the room the offer names", () => {
    /*
     * The reconnect case. Refusing here was the bug: the server has already
     * dropped this player, so doing nothing leaves the two halves disagreeing
     * about whether they are in the room, and only the next click reveals it.
     */
    test("re-joins, rather than assuming the room is still theirs", () => {
        const store = useMinesweeperStore.getState();
        store.setPlayerJoined(true);
        store.setRoom(ROOM);
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });

        expect(joinEmits(socket)).toEqual([[CLIENT_EVENTS.JOIN_ROOM, { room: ROOM, name: NAME }]]);
    });
});

describe("when the offer is not for the room on screen", () => {
    test("ignores an offer for a different room", () => {
        const store = useMinesweeperStore.getState();
        store.setPlayerJoined(true);
        store.setRoom("room-b");
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });

        expect(joinEmits(socket)).toEqual([]);
        expect(useMinesweeperStore.getState().room).toBe("room-b");
    });

    test("ignores an offer while the daily challenge is open", () => {
        // Picking the daily is a real choice. Accepting here would set
        // playerJoined behind the daily view, and the player would land in an
        // old room the moment they left it.
        useMinesweeperStore.getState().setDailyActive(true);
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });

        expect(joinEmits(socket)).toEqual([]);
        expect(useMinesweeperStore.getState().playerJoined).toBe(false);
    });
});

/*
 * Which slot a clear is filed in, driven through the real win handlers.
 *
 * `playersForClear` decides it and is unit-tested next door; what these are
 * about is the handler using it for the KEY as well as for the number stored on
 * the record. Filed under one count and looked up under another, a record is
 * simply never found again — and nothing says so.
 */
describe("filing a clear as a personal best", () => {
    const BOARD = { rows: 16, cols: 16, mines: 40 };

    const roomOf = (size: number) =>
        Array.from({ length: size }, (_, i) => ({ name: `P${i + 1}`, score: 0 }));

    const finishAt = (seconds: number) => {
        const store = useMinesweeperStore.getState();
        store.setDimensions(BOARD.rows, BOARD.cols, BOARD.mines);
        store.setClock({ startedAt: 0, endedAt: seconds * 1000 });
    };

    const win = (socket: AppSocket, event: "gameWon" | "pvpPlayerWon") => {
        const handlers = useGameEvents(socket, vi.fn());
        if (event === "gameWon") handlers[SERVER_EVENTS.GAME_WON]!();
        else handlers[SERVER_EVENTS.PVP_PLAYER_WON]!({ winnerSocket: socket.id!, winnerName: "You" });
    };

    beforeEach(() => {
        clearBestTimes();
        const store = useMinesweeperStore.getState();
        store.setMode("co-op");
        store.setPlayerStatsInRoom([]);
        store.setBestsAccountReady(false);
    });

    test("a co-op clear is filed under the size of the room", () => {
        useMinesweeperStore.getState().setPlayerStatsInRoom(roomOf(3));
        finishAt(120);

        win(fakeSocket(), "gameWon");

        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines, 3))?.seconds).toBe(120);
        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines))).toBeNull();
    });

    /*
     * The race is the case that was wrong. Both racers are in the room, so the
     * roster said two — but you cleared the whole board yourself, and it was
     * filed next to co-op clears that split one between two people, captioned
     * "with 2 players".
     */
    test("winning a race is filed as solo, not as the two in the room", () => {
        const store = useMinesweeperStore.getState();
        store.setMode("pvp");
        store.setPlayerStatsInRoom(roomOf(2));
        finishAt(200);

        win(fakeSocket(), "pvpPlayerWon");

        const solo = readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines));
        expect(solo?.seconds).toBe(200);
        expect(solo?.players).toBe(1);
        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines, 2))).toBeNull();
    });

    /*
     * A run made under an account belongs to it. The stamp is what lets the
     * sync evict it when a DIFFERENT account signs in on this browser, instead
     * of pushing one account's clear into the next (lib/bestTimes.ts).
     */
    test("a clear made once the sync owns the account is stamped as its", () => {
        useMinesweeperStore.getState().setBestsAccountReady(true);
        finishAt(120);

        win(fakeSocket(), "gameWon");

        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines))?.synced).toBe(true);
    });

    /*
     * Covers both the guest and the signed-in-but-not-yet-synced window: a
     * stamp before the first merge stakes the account's claim would be
     * evicted as ANOTHER account's, with a pull that can predate the server's
     * own record of the win — unstamped, the run rides the sync's push
     * instead (gameSlice.bestsAccountReady).
     */
    test("a clear before the account is staked carries no stamp", () => {
        finishAt(120);

        win(fakeSocket(), "gameWon");

        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines))?.synced).toBeUndefined();
    });

    /* The whole point: one no longer takes the other's slot. */
    test("a group's fast clear does not stop a solo one being a record", () => {
        useMinesweeperStore.getState().setPlayerStatsInRoom(roomOf(2));
        finishAt(60);
        win(fakeSocket(), "gameWon");

        useMinesweeperStore.getState().setPlayerStatsInRoom([]);
        finishAt(300);
        win(fakeSocket(), "gameWon");

        expect(useMinesweeperStore.getState().bestTimeResult?.improved).toBe(true);
        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines))?.seconds).toBe(300);
        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines, 2))?.seconds).toBe(60);
    });
});

/**
 * Which room a practice target belongs to.
 *
 * The target used to be set when the player ASKED for practice, which is a
 * request rather than a room — and a request can be refused, or overtaken by a
 * real opponent arriving in the same round trip. Either way the target outlived
 * the thing it was for: the next ordinary room drew a "Par" bar nobody had
 * asked for, and a player pulled into a live PVP race got one over the top of
 * it. Nothing errored; there was simply a second bar pacing a time that meant
 * nothing.
 *
 * So it is read from the room that actually arrives, and `practice` on the
 * answer is the only thing that puts one there.
 */
describe("the practice target follows the room, not the request", () => {
    const PRACTICE_BOARD = { rows: 16, cols: 16, mines: 40 };

    const join = (extra: Record<string, unknown>) => {
        const handlers = useGameEvents(fakeSocket(), vi.fn());
        handlers[SERVER_EVENTS.JOIN_ROOM_SUCCESS]!({
            room: "r",
            mode: "co-op",
            numRows: PRACTICE_BOARD.rows,
            numCols: PRACTICE_BOARD.cols,
            numMines: PRACTICE_BOARD.mines,
            ...extra,
        });
    };

    beforeEach(() => {
        clearBestTimes();
        useMinesweeperStore.getState().setPracticeTarget(null);
    });

    test("a labelled room gets one", () => {
        join({ practice: true });

        expect(useMinesweeperStore.getState().practiceTargetMs).toBeGreaterThan(0);
    });

    test("it is the player's own record when they have one", () => {
        recordBestTime(boardKey(PRACTICE_BOARD.rows, PRACTICE_BOARD.cols, PRACTICE_BOARD.mines), {
            seconds: 111,
            players: 1,
            at: 1,
        });

        join({ practice: true });

        expect(useMinesweeperStore.getState().practiceTargetMs).toBe(111_000);
        expect(useMinesweeperStore.getState().practiceTargetIsPersonal).toBe(true);
    });

    test("an ordinary room CLEARS one left over from a refused request", () => {
        join({ practice: true });
        expect(useMinesweeperStore.getState().practiceTargetMs).not.toBeNull();

        // The player's practice start failed, they went back to Landing and
        // made a normal room. It must not inherit the target.
        join({});

        expect(useMinesweeperStore.getState().practiceTargetMs).toBeNull();
    });

    test("being pulled into a PVP race instead never draws a target", () => {
        // Stands in for the target the client used to set the moment practice
        // was CLICKED. The player asked for practice just as a real opponent
        // turned up, so the room that arrives is the match's -- and a bar here
        // would be the fake opponent this whole feature is built to avoid.
        useMinesweeperStore.getState().setPracticeTarget({ ms: 480_000, isPersonal: false });

        join({ mode: "pvp", isHost: false });

        expect(useMinesweeperStore.getState().practiceTargetMs).toBeNull();
    });
});
