"use client";

import { Socket } from "socket.io-client";
import { Cell, PlayerStats, useMinesweeperStore } from "@/app/store";
import { shootConfetti } from "@/lib/confetti";
import { generateColorFromId } from "@/lib/throttle";
import type { SocketHandlers } from "./useSocketEvents";

/** A partial cell update as sent by `updateCells` / `pvpUpdateCells`. */
type CellUpdate = Cell & { row: number; col: number };

/** Dialogs are native <dialog> elements addressed by id. See ARCHITECTURE.md. */
const openDialog = (id: string) => (document.getElementById(id) as HTMLDialogElement | null)?.showModal();

const applyCellUpdates = (updates: CellUpdate[]) => {
    const { setCell } = useMinesweeperStore.getState();
    updates.forEach((cell) => {
        setCell(cell.row, cell.col, {
            isMine: cell.isMine,
            isOpen: cell.isOpen,
            isFlagged: cell.isFlagged,
            nearbyMines: cell.nearbyMines,
        });
    });
};

/** Shared + co-op events. */
const coopHandlers = (leaveRoom: () => void): SocketHandlers => ({
    // --- Game state ---
    boardUpdate: (board: Cell[][]) => useMinesweeperStore.getState().setBoard(board),

    updateCells: applyCellUpdates,

    playerStatsUpdate: (stats: PlayerStats[]) => useMinesweeperStore.getState().setPlayerStatsInRoom(stats),

    // --- Win / loss ---
    gameWon: () => {
        shootConfetti();
        useMinesweeperStore.getState().setGameWon(true);
    },

    gameOver: (name: string) => {
        const store = useMinesweeperStore.getState();
        store.setGameOver(true);
        store.setGameOverName(name);
        openDialog("dialog-game-over");
    },

    resetEveryone: () => {
        const store = useMinesweeperStore.getState();
        store.setGameOver(false);
        store.setGameWon(false);
        store.clearAllHovers();
    },

    // --- Room management ---
    joinRoomSuccess: (data: { room: string; mode?: string; isHost?: boolean; numRows?: number; numCols?: number; numMines?: number }) => {
        const store = useMinesweeperStore.getState();
        store.setRoom(data.room);
        if (data.mode) store.setMode(data.mode);
        if (data.isHost !== undefined) store.setPvpIsHost(data.isHost);
        // Sync difficulty config for joining players (fixes flag counter bug)
        if (data.numRows && data.numCols && data.numMines) {
            store.setDimensions(data.numRows, data.numCols, data.numMines);
        }
        store.setPlayerJoined(true);
    },

    joinRoomError: () => openDialog("dialog-join-room-error"),
    createRoomError: () => openDialog("dialog-create-room-error"),

    roomDoesNotExistError: () => {
        leaveRoom();
        openDialog("dialog-room-does-not-exist-error");
    },

    receiveConfetti: () => shootConfetti(),

    // --- Hover presence (co-op only; the server suppresses it in PVP) ---
    playerHoverUpdate: ({ id, row, col, name }: { id: string; row: number; col: number; name: string }) => {
        const store = useMinesweeperStore.getState();
        if (row === -1 && col === -1) {
            store.removePlayerHover(id);
        } else {
            store.updatePlayerHover(id, row, col, name, generateColorFromId(id));
        }
    },

    playerLeft: (socketId: string) => useMinesweeperStore.getState().removePlayerHover(socketId),
});

/** PVP events. `socket` is needed to tell "I won" from "they won". */
const pvpHandlers = (socket: Socket): SocketHandlers => ({
    pvpRoomFull: () => openDialog("dialog-pvp-room-full"),

    pvpRoomReady: (data: { opponentName?: string; isHost?: boolean }) => {
        const store = useMinesweeperStore.getState();
        store.setPvpRoomReady(true);
        if (data?.opponentName) store.setPvpOpponentName(data.opponentName);
        if (data?.isHost !== undefined) store.setPvpIsHost(data.isHost);
    },

    pvpGameStarted: (data: { totalSafeCells?: number }) => {
        const store = useMinesweeperStore.getState();
        store.setPvpStarted(true);
        store.setPvpOpponentStatus("playing");
        if (data?.totalSafeCells) store.setPvpTotalSafeCells(data.totalSafeCells);
        store.setPvpOpponentProgress(0);
    },

    pvpBoardUpdate: ({ board, playerIndex, opponentName, opponentProgress, totalSafeCells }: {
        board: Cell[][];
        playerIndex: number;
        opponentName?: string;
        opponentProgress?: number;
        totalSafeCells?: number;
    }) => {
        const store = useMinesweeperStore.getState();
        store.setBoard(board);
        if (playerIndex !== undefined) store.setPvpPlayerIndex(playerIndex);
        if (opponentName) store.setPvpOpponentName(opponentName);
        if (opponentProgress !== undefined) store.setPvpOpponentProgress(opponentProgress);
        if (totalSafeCells !== undefined) store.setPvpTotalSafeCells(totalSafeCells);
    },

    pvpUpdateCells: applyCellUpdates,

    pvpGameOver: () => {
        const store = useMinesweeperStore.getState();
        store.setGameOver(true);
        store.setPvpOpponentStatus("playing"); // Opponent might still be playing
        openDialog("dialog-pvp-game-over");
    },

    pvpOpponentFailed: () => useMinesweeperStore.getState().setPvpOpponentStatus("failed"),
    pvpOpponentReset: () => useMinesweeperStore.getState().setPvpOpponentStatus("playing"),

    pvpPlayerWon: ({ winnerSocket, winnerName }: { winnerSocket: string; winnerName: string }) => {
        const store = useMinesweeperStore.getState();
        store.setPvpWinner(winnerName);
        store.setPvpOpponentStatus("won");

        if (socket.id === winnerSocket) {
            shootConfetti();
            store.setGameWon(true);
            openDialog("dialog-pvp-you-won");
        } else {
            openDialog("dialog-pvp-opponent-won");
        }
    },

    pvpOpponentProgress: ({ progress }: { progress: number }) => useMinesweeperStore.getState().setPvpOpponentProgress(progress),

    pvpOpponentDisconnected: ({ winnerName }: { winnerName: string }) => {
        const store = useMinesweeperStore.getState();
        store.setPvpWinner(winnerName);
        store.setPvpOpponentStatus("disconnected");
        shootConfetti();
        store.setGameWon(true);
        openDialog("dialog-pvp-opponent-disconnected");
    },

    pvpOpponentLeftBeforeStart: () => {
        const store = useMinesweeperStore.getState();
        store.setPvpRoomReady(false);
        store.setPvpOpponentName("");
    },

    pvpHostTransferred: () => useMinesweeperStore.getState().setPvpIsHost(true),

    pvpRematchStarted: ({ totalSafeCells, isHost }: { totalSafeCells: number; isHost: boolean }) => {
        const store = useMinesweeperStore.getState();
        store.resetPvpState();
        store.setPvpStarted(true);
        store.setPvpOpponentStatus("playing");
        store.setPvpTotalSafeCells(totalSafeCells);
        store.setPvpOpponentProgress(0);
        store.setPvpIsHost(isHost); // Restore host status after reset
    },
});

/**
 * The full server -> client event table.
 *
 * Handlers write through `useMinesweeperStore.getState()` rather than subscribing,
 * so this hook causes no re-renders of its own — which is why `page.tsx` no
 * longer re-renders on every remote hover event.
 */
export function useGameEvents(socket: Socket | null, leaveRoom: () => void): SocketHandlers {
    if (!socket) return {};
    return { ...coopHandlers(leaveRoom), ...pvpHandlers(socket) };
}
