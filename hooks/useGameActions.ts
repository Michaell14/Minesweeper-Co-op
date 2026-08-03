"use client";

import { useCallback, useMemo } from "react";
import { useMinesweeperStore } from "@/app/store";
import { throttle } from "@/lib/throttle";
import { getOrCreateDailyAttemptToken, readDailyAttemptToken } from "@/lib/dailyIdentity";
import { DEFAULT_DIFFICULTY, DEFAULT_SIZE } from "@/shared/boardConfig";
import { CLIENT_EVENTS } from "@/shared/events";
import type { AppSocket } from "@/lib/initSocket";
import { playSound, type SoundName } from "@/lib/sound";
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

/**
 * The click sound for a cell action, decided CLIENT-side at emit time so
 * feedback is immediate rather than a round-trip later — but gated on the
 * local board, because the emits themselves are fire-and-forget and the
 * server refuses plenty of them: opening an open or flagged cell, flagging an
 * open cell, chording a closed one. A blip on a refused action is FALSE
 * feedback, so those return null and stay silent.
 */
export const cellActionSound = (
    isToggleFlag: boolean,
    isChord: boolean,
    row: number,
    col: number,
): SoundName | null => {
    const cell = useMinesweeperStore.getState().board[row]?.[col];
    if (isChord) return cell?.isOpen ? 'chord' : null;
    if (isToggleFlag) {
        if (cell?.isOpen) return null;
        return cell?.isFlagged ? 'unflag' : 'flag';
    }
    return cell?.isOpen || cell?.isFlagged ? null : 'reveal';
};

export function useGameActions(socket: AppSocket | null) {
    /** Leave the room and reset local state back to the Landing defaults. */
    const leaveRoom = useCallback(() => {
        if (!socket) return;

        const store = useMinesweeperStore.getState();

        // Clear the hover before leaving, or it lingers on everyone else's board.
        socket.emit(CLIENT_EVENTS.CELL_HOVER, { room: store.room, row: -1, col: -1 });
        socket.emit(CLIENT_EVENTS.PLAYER_LEAVE);

        store.setPlayerJoined(false);
        store.setBoard([]);
        store.setName("");
        // The roster belongs to the room being left. It also sizes the group a
        // best time is filed under, so leaving a game with friends and then
        // looking at the landing page would otherwise show their record for a
        // board you were about to play alone.
        store.setPlayerStatsInRoom([]);
        store.setBoardConfig(DEFAULT_SIZE, DEFAULT_DIFFICULTY);
        store.clearAllHovers();
        store.resetPvpState(); // also resets gameOver/gameWon
        store.setMode("co-op");
        // The clock is the record of the run THIS browser played, and
        // `recordClear` treats a set one as proof there was a run to record.
        // Left standing, joining a room whose game was already won filed the
        // previous game's time as a personal best for a board never played:
        // the server catches an arriving player up with `gameWon`, and the
        // handler had a stale clock to read.
        store.setClock({ startedAt: null, endedAt: null });
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

    /** No room, no action. */
    const emitCellAction = useCallback(
        (event: CellActionEvent, row: number, col: number) => {
            const { playerJoined, room } = useMinesweeperStore.getState();
            if (!playerJoined || !socket) return;
            const sound = cellActionSound(event === CLIENT_EVENTS.TOGGLE_FLAG, event === CLIENT_EVENTS.CHORD_CELL, row, col);
            if (sound) playSound(sound);
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
        const store = useMinesweeperStore.getState();
        // Nothing confirms a reset, so `gameOver` is cleared optimistically —
        // which has to follow the same rule the SERVER refuses on. Once the race
        // has a winner it rejects the reset, and clearing anyway left a board
        // that looked playable and ignored every click.
        if (store.pvpWinner) return;
        emitForRoom(CLIENT_EVENTS.RESET_MY_BOARD);
        store.setGameOver(false);
    }, [emitForRoom]);

    const emitCellHover = useCallback(
        (row: number, col: number) => {
            const { room, playerJoined, settings } = useMinesweeperStore.getState();
            if (!socket || !room || !playerJoined) return;
            // The share-cursor opt-out (privacy setting). The (-1,-1) clear is
            // still allowed through so toggling off mid-hover removes your
            // cursor from teammates' boards instead of freezing it there.
            if (!settings.shareCursor && !(row === -1 && col === -1)) return;
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
        // Same reason as leaveRoom: a clock left running is read as a run this
        // browser played, and the next room to announce a win would record it.
        store.setClock({ startedAt: null, endedAt: null });
    }, []);

    const emitDailyCellAction = useCallback(
        (event: DailyCellActionEvent, row: number, col: number) => {
            const { dailyActive, dailyDate } = useMinesweeperStore.getState();
            if (!dailyActive || !socket) return;
            // Read, never mint: the move belongs to the attempt already in
            // flight. See lib/dailyIdentity.ts for what minting here cost.
            const dailyAttemptToken = readDailyAttemptToken();
            if (!dailyAttemptToken) return;
            const sound = cellActionSound(event === CLIENT_EVENTS.DAILY_TOGGLE_FLAG, event === CLIENT_EVENTS.DAILY_CHORD_CELL, row, col);
            if (sound) playSound(sound);
            socket.emit(event, { dailyAttemptToken, date: dailyDate, row, col });
        },
        [socket]
    );

    /**
     * Open/chord are the only actions that start the server's clock, but nothing
     * in the protocol says WHEN -- dailyUpdateCells is the same generic shape
     * every mode uses, with no room for a timestamp. So the local display timer
     * starts optimistically on the player's own first move. The leaderboard time
     * is always the server's startedAt/finishedAt, never this value.
     *
     * It can therefore start a beat before the server's (a click the server ends
     * up ignoring) -- cosmetic drift in a number nobody's score depends on.
     */
    const markDailyStartedOptimistically = useCallback(() => {
        const { dailyStatus, setDailyStatus, setClock } = useMinesweeperStore.getState();
        if (dailyStatus !== "ready") return;
        setDailyStatus("in_progress");
        // <Timer> reads gameSlice's shared clock; without this it sits at 00:00.
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
            const dailyAttemptToken = readDailyAttemptToken();
            if (!dailyAttemptToken) return;
            socket.emit(CLIENT_EVENTS.SUBMIT_DAILY_SCORE, { dailyAttemptToken, date: dailyDate, name });
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
