"use client";

import { useCallback, useMemo } from "react";
import { useMinesweeperStore } from "@/app/store";
import { throttle } from "@/lib/throttle";
import { getOrCreateDailyAttemptToken } from "@/lib/dailyIdentity";
import { DEFAULT_DIFFICULTY, DEFAULT_SIZE } from "@/shared/boardConfig";
import { CLIENT_EVENTS } from "@/shared/events";
import type { AppSocket } from "@/lib/initSocket";
import type { ClientToServerEvents } from "@/shared/socketPayloads";

/** The emits that take a room code and a cell. */
type CellActionEvent = 'openCell' | 'chordCell' | 'toggleFlag' | 'cellHover';

/** The daily-challenge emits that take an attempt token, date, and a cell. */
type DailyCellActionEvent = 'dailyOpenCell' | 'dailyChordCell' | 'dailyToggleFlag';

/** The emits whose whole payload is the room code. */
type RoomActionEvent = Extract<
    keyof ClientToServerEvents,
    'resetGame' | 'emitConfetti' | 'startPvpGame' | 'pvpRematch' | 'resetMyBoard'
>;

/**
 * Every client -> server emit, in one place.
 *
 * These read state through `useMinesweeperStore.getState()` at call time rather
 * than subscribing to it. That keeps the callbacks stable for the lifetime of a
 * socket, which matters because `Cell` is memoized on cell state alone and would
 * otherwise hold on to whichever callbacks it first received.
 */
export function useGameActions(socket: AppSocket | null) {
    /** Leave the room and reset local state back to the Landing defaults. */
    const leaveRoom = useCallback(() => {
        if (!socket) return;

        const store = useMinesweeperStore.getState();

        // Clear hover before leaving
        socket.emit(CLIENT_EVENTS.CELL_HOVER, { room: store.room, row: -1, col: -1 });
        socket.emit(CLIENT_EVENTS.PLAYER_LEAVE);

        store.setPlayerJoined(false);
        store.setBoard([]);
        store.setName("");
        store.setBoardConfig(DEFAULT_SIZE, DEFAULT_DIFFICULTY);
        store.clearAllHovers();
        store.resetPvpState(); // also resets gameOver/gameWon
        store.setMode("co-op");
    }, [socket]);

    const createRoom = useCallback(() => {
        const { room, numRows, numCols, numMines, name, mode } = useMinesweeperStore.getState();
        if (!room || !socket) return;
        socket.emit(CLIENT_EVENTS.CREATE_ROOM, { room, numRows, numCols, numMines, name, mode });
    }, [socket]);

    const joinRoom = useCallback(() => {
        const { room, name } = useMinesweeperStore.getState();
        if (!room || !socket) return;
        socket.emit(CLIENT_EVENTS.JOIN_ROOM, { room, name });
    }, [socket]);

    /** Guarded the same way the inline versions were: no room, no action. */
    const emitCellAction = useCallback(
        (event: CellActionEvent, row: number, col: number) => {
            const { playerJoined, room } = useMinesweeperStore.getState();
            if (!playerJoined || !socket) return;
            socket.emit(event, { room, row, col });
        },
        [socket]
    );

    const openCell = useCallback((row: number, col: number) => emitCellAction(CLIENT_EVENTS.OPEN_CELL, row, col), [emitCellAction]);
    const chordCell = useCallback((row: number, col: number) => emitCellAction(CLIENT_EVENTS.CHORD_CELL, row, col), [emitCellAction]);
    const toggleFlag = useCallback((row: number, col: number) => emitCellAction(CLIENT_EVENTS.TOGGLE_FLAG, row, col), [emitCellAction]);

    /** Room-scoped emits with no payload beyond the room code. */
    const emitForRoom = useCallback(
        (event: RoomActionEvent) => {
            if (!socket) return;
            socket.emit(event, { room: useMinesweeperStore.getState().room });
        },
        [socket]
    );

    const resetGame = useCallback(() => emitForRoom(CLIENT_EVENTS.RESET_GAME), [emitForRoom]);
    const emitConfetti = useCallback(() => emitForRoom(CLIENT_EVENTS.EMIT_CONFETTI), [emitForRoom]);
    const startPvpGame = useCallback(() => emitForRoom(CLIENT_EVENTS.START_PVP_GAME), [emitForRoom]);
    const pvpRematch = useCallback(() => emitForRoom(CLIENT_EVENTS.PVP_REMATCH), [emitForRoom]);

    const resetMyBoard = useCallback(() => {
        emitForRoom(CLIENT_EVENTS.RESET_MY_BOARD);
        useMinesweeperStore.getState().setGameOver(false);
    }, [emitForRoom]);

    const emitCellHover = useCallback(
        (row: number, col: number) => {
            const { room, playerJoined } = useMinesweeperStore.getState();
            if (!socket || !room || !playerJoined) return;
            socket.emit(CLIENT_EVENTS.CELL_HOVER, { room, row, col });
        },
        [socket]
    );

    // Throttled so a fast mouse cannot flood the room with hover packets.
    const throttledEmitCellHover = useMemo(() => throttle(emitCellHover, 100), [emitCellHover]);

    /** Clear this player's hover when the pointer leaves the board entirely. */
    const handleBoardLeave = useCallback(() => emitCellHover(-1, -1), [emitCellHover]);

    // --- Daily challenge ---

    const startDaily = useCallback(() => {
        if (!socket) return;
        socket.emit(CLIENT_EVENTS.START_DAILY, { dailyAttemptToken: getOrCreateDailyAttemptToken() });
    }, [socket]);

    /** Leave the daily view and return to Landing. No server event: the
     * attempt itself persists in Redis regardless of whether this tab stays. */
    const leaveDaily = useCallback(() => {
        const store = useMinesweeperStore.getState();
        store.setDailyActive(false);
        store.setBoard([]);
        store.setGameOver(false);
        store.setGameWon(false);
        store.resetDailyState();
    }, []);

    const emitDailyCellAction = useCallback(
        (event: DailyCellActionEvent, row: number, col: number) => {
            const { dailyActive, dailyDate } = useMinesweeperStore.getState();
            if (!dailyActive || !socket) return;
            socket.emit(event, { dailyAttemptToken: getOrCreateDailyAttemptToken(), date: dailyDate, row, col });
        },
        [socket]
    );

    /**
     * Open/chord are the only two actions that start the server's clock (see
     * server/game/daily.js), but nothing in the protocol tells the client
     * WHEN that happens -- dailyUpdateCells is the same generic cell-update
     * shape every mode uses, with no room for a timestamp. Starting the local
     * display timer optimistically, on the player's own first open/chord
     * while still 'ready', is cosmetically correct (their own click is what
     * starts it) and costs nothing: the leaderboard time is always the
     * server's own startedAt/finishedAt, never this value.
     *
     * This can start the visible clock a beat before the server does (e.g. a
     * click on a cell the server ends up ignoring, like a stale double-fire
     * on an already-open cell) -- purely cosmetic drift in an on-screen
     * number nobody's score depends on, not worth the round-trip to avoid.
     */
    const markDailyStartedOptimistically = useCallback(() => {
        const { dailyStatus, setDailyStatus, setClock } = useMinesweeperStore.getState();
        if (dailyStatus !== "ready") return;
        setDailyStatus("in_progress");
        // <Timer> reads gameSlice's shared clock (see components/game/Timer.tsx)
        // -- without this it never learns the clock started and sits frozen at
        // 00:00.
        setClock({ startedAt: Date.now(), endedAt: null });
    }, []);

    const dailyOpenCell = useCallback(
        (row: number, col: number) => {
            markDailyStartedOptimistically();
            emitDailyCellAction(CLIENT_EVENTS.DAILY_OPEN_CELL, row, col);
        },
        [emitDailyCellAction, markDailyStartedOptimistically]
    );
    const dailyChordCell = useCallback(
        (row: number, col: number) => {
            markDailyStartedOptimistically();
            emitDailyCellAction(CLIENT_EVENTS.DAILY_CHORD_CELL, row, col);
        },
        [emitDailyCellAction, markDailyStartedOptimistically]
    );
    const dailyToggleFlag = useCallback(
        (row: number, col: number) => emitDailyCellAction(CLIENT_EVENTS.DAILY_TOGGLE_FLAG, row, col),
        [emitDailyCellAction]
    );

    /** Submits the winning name -- only valid while status is 'won_pending_submit'. */
    const submitDailyScore = useCallback(
        (name: string) => {
            if (!socket) return;
            const { dailyDate } = useMinesweeperStore.getState();
            socket.emit(CLIENT_EVENTS.SUBMIT_DAILY_SCORE, { dailyAttemptToken: getOrCreateDailyAttemptToken(), date: dailyDate, name });
        },
        [socket]
    );

    /** Also joins the live-update channel for that date, server-side. */
    const getDailyLeaderboard = useCallback(() => {
        const { dailyDate } = useMinesweeperStore.getState();
        if (!socket || !dailyDate) return;
        socket.emit(CLIENT_EVENTS.GET_DAILY_LEADERBOARD, { date: dailyDate });
    }, [socket]);

    return {
        leaveRoom,
        createRoom,
        joinRoom,
        openCell,
        chordCell,
        toggleFlag,
        resetGame,
        emitConfetti,
        startPvpGame,
        resetMyBoard,
        pvpRematch,
        emitCellHover: throttledEmitCellHover,
        handleBoardLeave,
        startDaily,
        leaveDaily,
        dailyOpenCell,
        dailyChordCell,
        dailyToggleFlag,
        submitDailyScore,
        getDailyLeaderboard,
    };
}
