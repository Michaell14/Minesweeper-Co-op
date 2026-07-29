"use client";

import { useCallback, useMemo } from "react";
import { useMinesweeperStore } from "@/app/store";
import { throttle } from "@/lib/throttle";
import { DEFAULT_DIFFICULTY, DEFAULT_PRESET } from "@/shared/boardConfig";
import { CLIENT_EVENTS } from "@/shared/events";
import type { AppSocket } from "@/lib/initSocket";
import type { ClientToServerEvents } from "@/shared/socketPayloads";

/** The emits that take a room code and a cell. */
type CellActionEvent = 'openCell' | 'chordCell' | 'toggleFlag' | 'cellHover';

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
        store.setDimensions(DEFAULT_PRESET.rows, DEFAULT_PRESET.cols, DEFAULT_PRESET.mines);
        store.setDifficulty(DEFAULT_DIFFICULTY);
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
    };
}
