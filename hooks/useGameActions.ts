"use client";

import { useCallback, useMemo } from "react";
import { Socket } from "socket.io-client";
import { useMinesweeperStore } from "@/app/store";
import { throttle } from "@/lib/throttle";

/**
 * Every client -> server emit, in one place.
 *
 * These read state through `useMinesweeperStore.getState()` at call time rather
 * than subscribing to it. That keeps the callbacks stable for the lifetime of a
 * socket, which matters because `Cell` is memoized on cell state alone and would
 * otherwise hold on to whichever callbacks it first received.
 */
export function useGameActions(socket: Socket | null) {
    /** Leave the room and reset local state back to the Landing defaults. */
    const leaveRoom = useCallback(() => {
        if (!socket) return;

        const store = useMinesweeperStore.getState();

        // Clear hover before leaving
        socket.emit("cellHover", { room: store.room, row: -1, col: -1 });
        socket.emit("playerLeave");

        store.setPlayerJoined(false);
        store.setBoard([]);
        store.setName("");
        store.setDimensions(16, 16, 40); // Default: Medium difficulty
        store.setDifficulty("Medium");
        store.clearAllHovers();
        store.resetPvpState(); // also resets gameOver/gameWon
        store.setMode("co-op");
    }, [socket]);

    const createRoom = useCallback(() => {
        const { room, numRows, numCols, numMines, name, mode } = useMinesweeperStore.getState();
        if (!room || !socket) return;
        socket.emit("createRoom", { room, numRows, numCols, numMines, name, mode });
    }, [socket]);

    const joinRoom = useCallback(() => {
        const { room, name } = useMinesweeperStore.getState();
        if (!room || !socket) return;
        socket.emit("joinRoom", { room, name });
    }, [socket]);

    /** Guarded the same way the inline versions were: no room, no action. */
    const emitCellAction = useCallback(
        (event: string, row: number, col: number) => {
            const { playerJoined, room } = useMinesweeperStore.getState();
            if (!playerJoined || !socket) return;
            socket.emit(event, { room, row, col });
        },
        [socket]
    );

    const openCell = useCallback((row: number, col: number) => emitCellAction("openCell", row, col), [emitCellAction]);
    const chordCell = useCallback((row: number, col: number) => emitCellAction("chordCell", row, col), [emitCellAction]);
    const toggleFlag = useCallback((row: number, col: number) => emitCellAction("toggleFlag", row, col), [emitCellAction]);

    /** Room-scoped emits with no payload beyond the room code. */
    const emitForRoom = useCallback(
        (event: string) => {
            if (!socket) return;
            socket.emit(event, { room: useMinesweeperStore.getState().room });
        },
        [socket]
    );

    const resetGame = useCallback(() => emitForRoom("resetGame"), [emitForRoom]);
    const emitConfetti = useCallback(() => emitForRoom("emitConfetti"), [emitForRoom]);
    const startPvpGame = useCallback(() => emitForRoom("startPvpGame"), [emitForRoom]);
    const pvpRematch = useCallback(() => emitForRoom("pvpRematch"), [emitForRoom]);

    const resetMyBoard = useCallback(() => {
        emitForRoom("resetMyBoard");
        useMinesweeperStore.getState().setGameOver(false);
    }, [emitForRoom]);

    const emitCellHover = useCallback(
        (row: number, col: number) => {
            const { room, playerJoined } = useMinesweeperStore.getState();
            if (!socket || !room || !playerJoined) return;
            socket.emit("cellHover", { room, row, col });
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
