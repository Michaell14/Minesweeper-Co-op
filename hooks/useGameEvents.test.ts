// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useMinesweeperStore } from "@/app/store";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import { boardKey, clearBestTimes, readBestTime, recordBestTime } from "@/lib/bestTimes";
import { useGameEvents } from "./useGameEvents";
import type { AppSocket } from "@/lib/initSocket";

// A win shoots confetti, and jsdom's canvas has no 2d context to give it.
vi.mock("@/lib/confetti", () => ({ shootConfetti: vi.fn() }));

/**
 * `sessionResume`, the offer the server makes to a browser it recognises. It
 * arrives on EVERY connect, and a reload (empty store, player on Landing) and
 * a socket.io reconnect (room still on screen) look nothing alike. The
 * reconnect used to be refused because `playerJoined` was still true, which
 * stranded the player in a room the server had already removed them from. The
 * refusal must still cover the daily and an offer for some OTHER room.
 *
 * A fake socket and the real store are the whole fixture; the DOM is only for
 * the win handlers' localStorage.
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
     * The reconnect case: the server has already dropped this player, so doing
     * nothing leaves the two halves disagreeing until the next click.
     */
    test("re-joins, rather than assuming the room is still theirs", () => {
        const store = useMinesweeperStore.getState();
        store.setPlayerJoined(true);
        store.setRoom(ROOM);
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });

        expect(joinEmits(socket)).toEqual([[CLIENT_EVENTS.JOIN_ROOM, { room: ROOM, name: NAME }]]);
    });

    test("discards an outcome superseded by a teammate's reset while offline", () => {
        const store = useMinesweeperStore.getState();
        store.setPlayerJoined(true);
        store.setRoom(ROOM);
        store.setGameOver(true);
        store.setGameWon(true);
        store.setClock({ startedAt: 1_000, endedAt: 5_000 });
        store.updatePlayerHover('old-socket', 0, 1, 'Bob', 'red');
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });
        // A reset room has no GAME_WON/GAME_OVER to overwrite these flags.
        const handlers = useGameEvents(socket, vi.fn());
        handlers[SERVER_EVENTS.GAME_CLOCK]!({ startedAt: null, endedAt: null });
        handlers[SERVER_EVENTS.JOIN_ROOM_SUCCESS]!({ room: ROOM, mode: 'co-op' });

        expect(useMinesweeperStore.getState().gameOver).toBe(false);
        expect(useMinesweeperStore.getState().gameWon).toBe(false);
        expect(useMinesweeperStore.getState().bestTimeResult).toBeNull();
        expect(useMinesweeperStore.getState().playerHovers).toEqual({});
    });

    test("a resumed race does not inherit the winner of an offline rematch", () => {
        const store = useMinesweeperStore.getState();
        store.setPlayerJoined(true);
        store.setRoom(ROOM);
        store.setMode('pvp');
        store.setGameOver(true);
        store.setPvpWinner('Previous winner');
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });
        const handlers = useGameEvents(socket, vi.fn());
        handlers[SERVER_EVENTS.PVP_GAME_STARTED]!({ totalSafeCells: 100 });
        handlers[SERVER_EVENTS.JOIN_ROOM_SUCCESS]!({ room: ROOM, mode: 'pvp', isHost: true });

        expect(useMinesweeperStore.getState().gameOver).toBe(false);
        expect(useMinesweeperStore.getState().pvpWinner).toBeNull();
        expect(useMinesweeperStore.getState().pvpStarted).toBe(true);
        expect(useMinesweeperStore.getState().pvpIsHost).toBe(true);
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
        // Accepting would set playerJoined behind the daily view, and the
        // player would land in an old room the moment they left it.
        useMinesweeperStore.getState().setDailyActive(true);
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });

        expect(joinEmits(socket)).toEqual([]);
        expect(useMinesweeperStore.getState().playerJoined).toBe(false);
    });
});

/*
 * Which slot a clear is filed in, through the real win handlers. `playersForClear`
 * is unit-tested next door; this is about the handler using it for the KEY as
 * well as the stored count. Filed under one and looked up under another, a
 * record is never found again.
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
        store.setRelaxed(false);
        store.setPlayerStatsInRoom([]);
        store.setAccountBests(null);
    });

    afterEach(() => useMinesweeperStore.getState().setAccountBests(null));

    test("a co-op clear is filed under the size of the room", () => {
        useMinesweeperStore.getState().setPlayerStatsInRoom(roomOf(3));
        finishAt(120);

        win(fakeSocket(), "gameWon");

        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines, 3))?.seconds).toBe(120);
        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines))).toBeNull();
    });

    /*
     * The race is the case that was wrong: the roster said two, but you cleared
     * the whole board yourself.
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

describe("terminal snapshots do not earn personal bests", () => {
    const BOARD = { rows: 16, cols: 16, mines: 40 };

    beforeEach(() => {
        useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true);
        clearBestTimes();
        const store = useMinesweeperStore.getState();
        store.setRelaxed(false);
        store.setDimensions(BOARD.rows, BOARD.cols, BOARD.mines);
        store.setClock({ startedAt: 1_000, endedAt: 61_000 });
        store.setAccountBests({});
    });

    afterEach(() => useMinesweeperStore.getState().setAccountBests(null));

    test("a late arrival sees the won board without receiving someone else's record", () => {
        const store = useMinesweeperStore.getState();
        store.setPlayerStatsInRoom([{ name: 'Original player', score: 216 }, { name: 'Late arrival', score: 0 }]);
        const handlers = useGameEvents(fakeSocket(), vi.fn());

        handlers[SERVER_EVENTS.GAME_WON]!({ replay: true });

        expect(useMinesweeperStore.getState().gameWon).toBe(true);
        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines, 2))).toBeNull();
        expect(useMinesweeperStore.getState().accountBests).toEqual({});
        expect(useMinesweeperStore.getState().bestTimeResult).toBeNull();
    });

    test("a resumed group clear is not refiled under the roster present after the game", () => {
        const originalKey = boardKey(BOARD.rows, BOARD.cols, BOARD.mines, 2);
        recordBestTime(originalKey, { seconds: 60, players: 2, at: 61_000 });
        useMinesweeperStore.getState().setPlayerStatsInRoom([
            { name: 'Alice', score: 100 }, { name: 'Bob', score: 116 }, { name: 'Late arrival', score: 0 },
        ]);

        useGameEvents(fakeSocket(), vi.fn())[SERVER_EVENTS.GAME_WON]!({ replay: true });

        expect(readBestTime(originalKey)?.seconds).toBe(60);
        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines, 3))).toBeNull();
        expect(useMinesweeperStore.getState().accountBests).toEqual({});
    });

    test("a returning PvP winner sees victory without recording the old clear again", () => {
        useMinesweeperStore.getState().setMode('pvp');
        const socket = fakeSocket();

        useGameEvents(socket, vi.fn())[SERVER_EVENTS.PVP_PLAYER_WON]!({
            winnerSocket: socket.id!, winnerName: 'Alice', replay: true,
        });

        expect(useMinesweeperStore.getState().gameWon).toBe(true);
        expect(useMinesweeperStore.getState().pvpOpponentStatus).toBe('lost');
        expect(readBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines))).toBeNull();
        expect(useMinesweeperStore.getState().accountBests).toEqual({});
        expect(useMinesweeperStore.getState().bestTimeResult).toBeNull();
    });
});

/**
 * A clear while SIGNED IN. The browser's copy is still written (the guest
 * record and the fallback), but the verdict comes from the account: on a new
 * device localStorage has nothing, so every comparison against it says "New best!".
 */
describe("recording a clear against an account", () => {
    const BOARD = { rows: 16, cols: 16, mines: 40 };
    const KEY = boardKey(BOARD.rows, BOARD.cols, BOARD.mines);

    const finishAt = (seconds: number) => {
        const store = useMinesweeperStore.getState();
        store.setDimensions(BOARD.rows, BOARD.cols, BOARD.mines);
        store.setClock({ startedAt: 0, endedAt: seconds * 1000 });
    };

    const winCoop = () => {
        const handlers = useGameEvents(fakeSocket(), vi.fn());
        handlers[SERVER_EVENTS.GAME_WON]!();
    };

    beforeEach(() => {
        clearBestTimes();
        const store = useMinesweeperStore.getState();
        store.setMode("co-op");
        store.setRelaxed(false);
        store.setPlayerStatsInRoom([]);
        store.setAccountBests({});
    });

    afterEach(() => useMinesweeperStore.getState().setAccountBests(null));

    test("a slower run is not a record just because this browser is new", () => {
        useMinesweeperStore.getState().setAccountBests({ [KEY]: { seconds: 90, players: 1, at: 1 } });
        finishAt(300);

        winCoop();

        const result = useMinesweeperStore.getState().bestTimeResult;
        expect(result?.improved).toBe(false);
        expect(result?.previous?.seconds).toBe(90);
        // …and the browser's own copy still took it, since it had nothing.
        expect(readBestTime(KEY)?.seconds).toBe(300);
    });

    test("a faster run files against the account without waiting for the server", () => {
        useMinesweeperStore.getState().setAccountBests({ [KEY]: { seconds: 300, players: 1, at: 1 } });
        finishAt(90);

        winCoop();

        expect(useMinesweeperStore.getState().bestTimeResult?.improved).toBe(true);
        expect(useMinesweeperStore.getState().accountBests?.[KEY].seconds).toBe(90);
    });

    test("a group clear files under the group, on the account copy too", () => {
        useMinesweeperStore.getState().setPlayerStatsInRoom([
            { name: "P1", score: 0 },
            { name: "P2", score: 0 },
        ]);
        finishAt(60);

        winCoop();

        const bests = useMinesweeperStore.getState().accountBests;
        expect(bests?.[`${KEY}@2`].seconds).toBe(60);
        expect(bests?.[KEY]).toBeUndefined();
    });

    test("signed out, the browser's record is the verdict as before", () => {
        useMinesweeperStore.getState().setAccountBests(null);
        recordBestTime(KEY, { seconds: 90, players: 1, at: 1 });
        finishAt(300);

        winCoop();

        expect(useMinesweeperStore.getState().bestTimeResult?.improved).toBe(false);
        expect(readBestTime(KEY)?.seconds).toBe(90);
    });
});

/**
 * Which room a practice target belongs to. Set when practice was REQUESTED,
 * the target outlived a refused request or a real opponent arriving in the
 * same round trip: the next room drew a "Par" bar nobody asked for. So it is
 * read from the room that arrives, and only `practice` on the answer puts one there.
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

        // The practice start failed and they made a normal room; it must not inherit the target.
        join({});

        expect(useMinesweeperStore.getState().practiceTargetMs).toBeNull();
    });

    test("being pulled into a PVP race instead never draws a target", () => {
        // Stands in for the target the client used to set on the CLICK. A real
        // opponent turned up at the same moment, so the room that arrives is the match's.
        useMinesweeperStore.getState().setPracticeTarget({ ms: 480_000, isPersonal: false });

        join({ mode: "pvp", isHost: false });

        expect(useMinesweeperStore.getState().practiceTargetMs).toBeNull();
    });
});
