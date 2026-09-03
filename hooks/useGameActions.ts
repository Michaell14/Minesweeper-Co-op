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

/** Mirrors TERMINAL_STATUSES in dailyRepo. */
const TERMINAL_DAILY_STATUSES = ['failed', 'won_pending_submit', 'completed'];

/** The emits whose whole payload is the room code. */
type RoomActionEvent = Extract<
    keyof ClientToServerEvents,
    'resetGame' | 'emitConfetti' | 'startPvpGame' | 'pvpRematch' | 'resetMyBoard'
>;

/**
 * Every client -> server emit, in one place. State is read via `getState()` at
 * call time, not subscribed, so the callbacks stay stable for the socket's
 * lifetime: `Cell` is memoized on cell state alone and would keep stale ones.
 */

/**
 * Click sound for a cell action, decided client-side for immediacy but gated
 * on the local board: the server refuses actions on open/flagged cells, and a
 * blip on a refused action is false feedback, so those return null.
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
 * Anchors the cascade sweep on the acted-on cell before the server answers.
 * `applyCellUpdates` is the authority for incoming cell lists, but the first
 * click of a game returns a whole board with no origin to read, so this covers
 * it. Flags excluded: nothing about a flag animates.
 */
const markCascadeOrigin = (event: CellActionEvent | DailyCellActionEvent, row: number, col: number) => {
    if (event === CLIENT_EVENTS.TOGGLE_FLAG || event === CLIENT_EVENTS.DAILY_TOGGLE_FLAG) return;
    useMinesweeperStore.getState().setCascadeOrigin({ row, col });
};

/**
 * Whether the server will accept a flag here: the one action the client can
 * predict, since a flag needs no hidden state (opening cannot be predicted;
 * closed cells are projected). Mirrors the `toggleFlag` guards in all three
 * modes; the daily gate (`dailyStatus`) is applied by `emitDailyCellAction`.
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

        // Clear the hover first, or it lingers on everyone else's board.
        socket.emit(CLIENT_EVENTS.CELL_HOVER, { room: store.room, row: -1, col: -1 });
        socket.emit(CLIENT_EVENTS.PLAYER_LEAVE);

        store.setPlayerJoined(false);
        store.setBoard([]);
        store.setName("");
        // The roster also sizes the group a best time is filed under; left
        // standing, Landing would show the group's record for a solo board.
        store.setPlayerStatsInRoom([]);
        // Also retires any in-flight co-player list, so rejoining the same
        // room does not inherit the last visit's players.
        store.resetRoomFriends();
        store.setBoardConfig(DEFAULT_SIZE, DEFAULT_DIFFICULTY);
        store.clearAllHovers();
        store.clearPlayerEmotes();
        store.clearPlayerPings();
        // A one-shot arm left standing would ping the next room's first click.
        store.setPingArmed(false);
        store.resetPvpState(); // also resets gameOver/gameWon
        store.setMode("co-op");
        // `recordClear` treats a set clock as proof of a run; left standing,
        // joining an already-won room filed the previous game's time as a best.
        store.setClock({ startedAt: null, endedAt: null });
        // Joining resets the target too, but leaving joins nothing.
        store.setPracticeTarget(null);
        store.setKbCursor(null);
        store.setJoinPending(null);
    }, [socket]);

    const createRoom = useCallback(() => {
        const store = useMinesweeperStore.getState();
        const { room, numRows, numCols, numMines, name, mode } = store;
        if (!room || !socket) return;
        // Cleared by joinRoomSuccess or an error handler (useGameEvents).
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
     * Join the quick-match queue. The dialog opens now, not on `matchSearching`:
     * an instant pairing never sends that event. Every exit closes it.
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
     * Race a target time instead of an opponent. Sets no target: the request
     * can be refused or overtaken by a real opponent, so `joinRoomSuccess`
     * reads the target from whichever room arrives.
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
            // Sound first: it reads the cell as it was, before the optimistic flag.
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
        // `gameOver` clears optimistically, so it must follow the server's
        // refusal rule: a decided race rejects the reset.
        if (store.pvpWinner) return;
        emitForRoom(CLIENT_EVENTS.RESET_MY_BOARD);
        store.setGameOver(false);
    }, [emitForRoom]);

    /**
     * Send a reaction. No optimistic echo: the server sends `playerEmote` to the
     * sender too, and a refused emote should draw nothing. `settings.emotes` is
     * not read here; it governs what you receive (hooks/useGameEvents.ts).
     */
    const sendEmote = useCallback(
        (emote: string) => {
            const { room, playerJoined } = useMinesweeperStore.getState();
            if (!socket || !room || !playerJoined) return;
            socket.emit(CLIENT_EVENTS.SEND_EMOTE, { room, emote });
        },
        [socket]
    );

    /**
     * Point at a cell for the room. Disarms first and unconditionally: the arm
     * is one-shot and must clear even on a click the guards drop. No
     * `settings.emotes` check, same as sendEmote.
     */
    const pingCell = useCallback(
        (row: number, col: number) => {
            const { room, playerJoined, mode, setPingArmed } = useMinesweeperStore.getState();
            setPingArmed(false);
            if (!socket || !room || !playerJoined) return;
            // Refused server-side in PVP anyway; keeps it out of the rate bucket.
            if (mode === 'pvp') return;
            socket.emit(CLIENT_EVENTS.PING_CELL, { room, row, col });
        },
        [socket]
    );

    /**
     * Invite a friend into this room. Every real check (friendship, membership,
     * capacity, cooldown) is the server's; the client cannot see that state.
     */
    const inviteFriend = useCallback(
        (friendId: string) => {
            const { room, playerJoined } = useMinesweeperStore.getState();
            if (!socket || !room || !playerJoined) return;
            socket.emit(CLIENT_EVENTS.INVITE_FRIEND, { friendId, room });
        },
        [socket]
    );

    /**
     * Add a co-player from the room just played, addressed by socket id: account
     * ids never reach the client. Requesting the list lives where the summary
     * opens (hooks/useGameEvents.ts), so it fires once per game.
     */
    const addRoomFriend = useCallback(
        (playerId: string) => {
            const store = useMinesweeperStore.getState();
            const { room, playerJoined } = store;
            if (!socket || !room || !playerJoined) return;
            socket.emit(CLIENT_EVENTS.ADD_ROOM_FRIEND, {
                room,
                playerId,
                token: store.nextRoomFriendsToken(),
            });
        },
        [socket]
    );

    const emitCellHover = useCallback(
        (row: number, col: number) => {
            const { room, playerJoined, settings } = useMinesweeperStore.getState();
            if (!socket || !room || !playerJoined) return;
            // The (-1,-1) clear passes the opt-out so toggling off mid-hover
            // removes the cursor instead of freezing it.
            if (!settings.shareCursor && !(row === -1 && col === -1)) return;
            socket.emit(CLIENT_EVENTS.CELL_HOVER, { room, row, col });
        },
        [socket]
    );

    // Throttled so a fast mouse cannot flood the room.
    const throttledEmitCellHover = useMemo(() => throttle(emitCellHover, 100), [emitCellHover]);

    /** Clears this player's hover when the pointer leaves the board. */
    const handleBoardLeave = useCallback(() => emitCellHover(-1, -1), [emitCellHover]);

    // --- Daily challenge ---

    const startDaily = useCallback(() => {
        if (!socket) return;
        socket.emit(CLIENT_EVENTS.START_DAILY, { dailyAttemptToken: getOrCreateDailyAttemptToken() });
    }, [socket]);

    /** Back to Landing. No server event: the attempt persists in Redis regardless. */
    const leaveDaily = useCallback(() => {
        const store = useMinesweeperStore.getState();
        store.setDailyActive(false);
        store.setBoard([]);
        store.setGameOver(false);
        store.setGameWon(false);
        store.resetDailyState();
        // Same reason as leaveRoom: a stale clock would be recorded as a run.
        store.setClock({ startedAt: null, endedAt: null });
        store.setKbCursor(null);
    }, []);

    const emitDailyCellAction = useCallback(
        (event: DailyCellActionEvent, row: number, col: number) => {
            const { dailyActive, dailyDate, dailyStatus } = useMinesweeperStore.getState();
            if (!dailyActive || !socket) return;
            // A finished attempt is view-only; the server refuses moves anyway,
            // and a blip here would be false feedback.
            if (TERMINAL_DAILY_STATUSES.includes(dailyStatus)) return;
            // Read, never mint: the move belongs to the attempt in flight (lib/dailyIdentity.ts).
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
     * Open/chord start the server's clock, but dailyUpdateCells carries no
     * timestamp, so the display timer starts optimistically on the first move.
     * The leaderboard time is always the server's; drift here is cosmetic.
     */
    const markDailyStartedOptimistically = useCallback(() => {
        const { dailyStatus, setDailyStatus, setClock } = useMinesweeperStore.getState();
        if (dailyStatus !== "ready") return;
        setDailyStatus("in_progress");
        // <Timer> reads gameSlice's shared clock.
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

    /** Only valid while status is 'won_pending_submit'. */
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
        sendEmote,
        pingCell,
        inviteFriend,
        addRoomFriend,
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
