"use client";

import { useCallback, useMemo } from "react";
import { useMinesweeperStore } from "@/app/store";
import { throttle } from "@/lib/throttle";
import { getOrCreateDailyAttemptToken, readDailyAttemptToken } from "@/lib/dailyIdentity";
import { DIALOGS, openDialog } from "@/lib/dialogs";
import { DEFAULT_DIFFICULTY, DEFAULT_SIZE } from "@/shared/boardConfig";
import { CLIENT_EVENTS } from "@/shared/events";
import type { AppSocket } from "@/lib/initSocket";
import { playSound, type SoundName } from "@/lib/sound";
import type { ClientToServerEvents } from "@/shared/socketPayloads";

/** The emits that take a room code and a cell. */
type CellActionEvent = 'openCell' | 'chordCell' | 'toggleFlag' | 'cellHover';

/** The daily-challenge emits that take an attempt token, date, and a cell. */
type DailyCellActionEvent = 'dailyOpenCell' | 'dailyChordCell' | 'dailyToggleFlag';

/** Statuses whose board is settled — mirrors TERMINAL_STATUSES in dailyRepo. */
const TERMINAL_DAILY_STATUSES = ['failed', 'won_pending_submit', 'completed'];

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

/**
 * Anchors the cascade sweep on the cell the player just acted on, before the
 * server has said anything.
 *
 * `applyCellUpdates` derives the same thing from an incoming cell list and is
 * the authority — including for a teammate's cascade, which this knows nothing
 * about. What it cannot cover is the FIRST click of a game: the board is
 * generated in response to it, so the server sends a whole board rather than a
 * cell list, and there is no origin in the payload to read. That is also the
 * biggest cascade in the game, and it was the one still sweeping off the board
 * diagonal.
 *
 * Flags are excluded: nothing about a flag animates.
 */
const markCascadeOrigin = (event: CellActionEvent | DailyCellActionEvent, row: number, col: number) => {
    if (event === CLIENT_EVENTS.TOGGLE_FLAG || event === CLIENT_EVENTS.DAILY_TOGGLE_FLAG) return;
    useMinesweeperStore.getState().setCascadeOrigin({ row, col });
};

/**
 * Whether the SERVER will accept a flag on this cell — the one action whose
 * outcome the client can work out for itself, which is what lets the flag land
 * on screen now instead of a round trip later.
 *
 * Opening cannot be done this way and never will be: the client is not told
 * `isMine` or `nearbyMines` for a closed cell (the projection guarantee), so it
 * has nothing to draw. A flag needs no hidden state at all.
 *
 * Mirrors the guards in `toggleFlag` across all three modes — co-op checks
 * gameOver/gameWon, PVP adds the race being started and undecided, and the daily
 * gate is `dailyStatus`, which `emitDailyCellAction` has already applied by the
 * time this runs. The cell itself is re-checked inside `toggleCellFlag`.
 */
const flagWillBeAccepted = (row: number, col: number): boolean => {
    const { gameOver, gameWon, mode, pvpStarted, pvpWinner, board } = useMinesweeperStore.getState();
    if (gameOver || gameWon) return false;
    if (mode === 'pvp' && (!pvpStarted || pvpWinner !== null)) return false;
    const cell = board[row]?.[col];
    return Boolean(cell) && !cell.isOpen;
};

/** Draws the flag before the server confirms it. See `flagWillBeAccepted`. */
const applyOptimisticFlag = (event: CellActionEvent | DailyCellActionEvent, row: number, col: number) => {
    if (event !== CLIENT_EVENTS.TOGGLE_FLAG && event !== CLIENT_EVENTS.DAILY_TOGGLE_FLAG) return;
    if (!flagWillBeAccepted(row, col)) return;
    useMinesweeperStore.getState().toggleCellFlag(row, col);
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
        // The target belongs to the run being left. Joining anywhere else
        // resets it too, but leaving lands on Landing and joins nothing.
        store.setPracticeTarget(null);
        // A stale keyboard cursor must not reappear on the next room's board.
        store.setKbCursor(null);
        // A pending join belongs to the attempt being abandoned.
        store.setJoinPending(null);
    }, [socket]);

    const createRoom = useCallback(() => {
        const store = useMinesweeperStore.getState();
        const { room, numRows, numCols, numMines, name, mode } = store;
        if (!room || !socket) return;
        // Landing shows "Creating room…" until the server answers; cleared by
        // joinRoomSuccess or any of the error handlers (useGameEvents).
        store.setJoinPending('create');
        socket.emit(CLIENT_EVENTS.CREATE_ROOM, { room, numRows, numCols, numMines, name, mode });
    }, [socket]);

    const joinRoom = useCallback(() => {
        const store = useMinesweeperStore.getState();
        const { room, name } = store;
        if (!room || !socket) return;
        store.setJoinPending('join');
        socket.emit(CLIENT_EVENTS.JOIN_ROOM, { room, name });
    }, [socket]);

    /**
     * Join the quick-match queue.
     *
     * The dialog opens NOW rather than on `matchSearching`: an instant pairing
     * never sends that event at all (the room arrives instead), so waiting for
     * it would mean the button did nothing visible on the fastest path and
     * something on the slowest. Every exit — paired, cancelled, failed — closes
     * it, so opening optimistically cannot strand anyone.
     */
    const findMatch = useCallback(() => {
        const { name } = useMinesweeperStore.getState();
        if (!name || !socket) return;
        useMinesweeperStore.getState().setMatchSearching(true);
        openDialog(DIALOGS.matchSearching);
        socket.emit(CLIENT_EVENTS.FIND_MATCH, { name });
    }, [socket]);

    /** Leave the queue. The dialog's own Cancel button closes it natively. */
    const cancelMatch = useCallback(() => {
        if (!socket) return;
        useMinesweeperStore.getState().setMatchSearching(false);
        socket.emit(CLIENT_EVENTS.CANCEL_MATCH);
    }, [socket]);

    /**
     * Give up on finding an opponent and race a target time instead.
     *
     * Sets no target: this is a REQUEST, and a request is not a room. It can be
     * refused, and it can be overtaken by a real opponent arriving in the same
     * round trip — in which case the room that turns up is a PVP race. The
     * target is read from whichever room actually arrives, in the
     * `joinRoomSuccess` handler.
     */
    const startPracticeRace = useCallback(() => {
        const { name } = useMinesweeperStore.getState();
        if (!name || !socket) return;

        useMinesweeperStore.getState().setMatchSearching(false);
        socket.emit(CLIENT_EVENTS.START_PRACTICE_RACE, { name });
    }, [socket]);

    /** No room, no action. */
    const emitCellAction = useCallback(
        (event: CellActionEvent, row: number, col: number) => {
            const { playerJoined, room } = useMinesweeperStore.getState();
            if (!playerJoined || !socket) return;
            // Sound first: it reads the cell as it was, so applying the flag
            // ahead of it would swap the flag and unflag blips.
            const sound = cellActionSound(event === CLIENT_EVENTS.TOGGLE_FLAG, event === CLIENT_EVENTS.CHORD_CELL, row, col);
            if (sound) playSound(sound);
            markCascadeOrigin(event, row, col);
            applyOptimisticFlag(event, row, col);
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
        store.setKbCursor(null);
    }, []);

    const emitDailyCellAction = useCallback(
        (event: DailyCellActionEvent, row: number, col: number) => {
            const { dailyActive, dailyDate, dailyStatus } = useMinesweeperStore.getState();
            if (!dailyActive || !socket) return;
            // A finished attempt's board is VIEW-ONLY — a fresh loss, a win
            // awaiting submit, or a resumed replay alike. The server refuses
            // moves on terminal attempts anyway; emitting (and blipping)
            // here would be false feedback on a board that cannot change.
            if (TERMINAL_DAILY_STATUSES.includes(dailyStatus)) return;
            // Read, never mint: the move belongs to the attempt already in
            // flight. See lib/dailyIdentity.ts for what minting here cost.
            const dailyAttemptToken = readDailyAttemptToken();
            if (!dailyAttemptToken) return;
            const sound = cellActionSound(event === CLIENT_EVENTS.DAILY_TOGGLE_FLAG, event === CLIENT_EVENTS.DAILY_CHORD_CELL, row, col);
            if (sound) playSound(sound);
            markCascadeOrigin(event, row, col);
            applyOptimisticFlag(event, row, col);
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
        findMatch,
        cancelMatch,
        startPracticeRace,
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
