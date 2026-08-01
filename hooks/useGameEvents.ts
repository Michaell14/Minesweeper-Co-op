"use client";

import { useMinesweeperStore } from "@/app/store";
import { shootConfetti } from "@/lib/confetti";
import { cursorColorForId } from "@/lib/theme";
import { DIALOGS, openDialog } from "@/lib/dialogs";
import { SERVER_EVENTS } from "@/shared/events";
import type { AppSocket } from "@/lib/initSocket";
import type { CellUpdate } from "@/shared/socketPayloads";
import type { SocketHandlers } from "./useSocketEvents";

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
    [SERVER_EVENTS.BOARD_UPDATE]: (board) => useMinesweeperStore.getState().setBoard(board),

    [SERVER_EVENTS.UPDATE_CELLS]: applyCellUpdates,

    [SERVER_EVENTS.PLAYER_STATS_UPDATE]: (stats) => useMinesweeperStore.getState().setPlayerStatsInRoom(stats),

    // Sent on start, on finish, and to anyone joining or refreshing mid-run.
    [SERVER_EVENTS.GAME_CLOCK]: (clock) => useMinesweeperStore.getState().setClock(clock),

    // --- Win / loss ---
    [SERVER_EVENTS.GAME_WON]: () => {
        shootConfetti();
        useMinesweeperStore.getState().setGameWon(true);
        openDialog(DIALOGS.gameSummary);
    },

    [SERVER_EVENTS.GAME_OVER]: (name) => {
        const store = useMinesweeperStore.getState();
        store.setGameOver(true);
        store.setGameOverName(name);
        openDialog(DIALOGS.gameSummary);
    },

    [SERVER_EVENTS.RESET_EVERYONE]: () => {
        const store = useMinesweeperStore.getState();
        store.setGameOver(false);
        store.setGameWon(false);
        store.clearAllHovers();
    },

    // --- Room management ---
    [SERVER_EVENTS.JOIN_ROOM_SUCCESS]: (data) => {
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

    [SERVER_EVENTS.JOIN_ROOM_ERROR]: () => openDialog(DIALOGS.joinRoomError),
    [SERVER_EVENTS.CREATE_ROOM_ERROR]: () => openDialog(DIALOGS.createRoomError),

    [SERVER_EVENTS.ROOM_DOES_NOT_EXIST_ERROR]: () => {
        leaveRoom();
        openDialog(DIALOGS.roomDoesNotExist);
    },

    [SERVER_EVENTS.RECEIVE_CONFETTI]: () => shootConfetti(),

    // --- Hover presence (co-op only; the server suppresses it in PVP) ---
    [SERVER_EVENTS.PLAYER_HOVER_UPDATE]: ({ id, row, col, name }) => {
        const store = useMinesweeperStore.getState();
        if (row === -1 && col === -1) {
            store.removePlayerHover(id);
        } else {
            store.updatePlayerHover(id, row, col, name, cursorColorForId(id));
        }
    },

    [SERVER_EVENTS.PLAYER_LEFT]: (socketId) => useMinesweeperStore.getState().removePlayerHover(socketId),
});

/** PVP events. `socket` is needed to tell "I won" from "they won". */
const pvpHandlers = (socket: AppSocket): SocketHandlers => ({
    [SERVER_EVENTS.PVP_ROOM_FULL]: () => openDialog(DIALOGS.pvpRoomFull),

    [SERVER_EVENTS.PVP_ROOM_READY]: (data) => {
        const store = useMinesweeperStore.getState();
        store.setPvpRoomReady(true);
        if (data?.opponentName) store.setPvpOpponentName(data.opponentName);
        if (data?.isHost !== undefined) store.setPvpIsHost(data.isHost);
    },

    [SERVER_EVENTS.PVP_GAME_STARTED]: (data) => {
        const store = useMinesweeperStore.getState();
        store.setPvpStarted(true);
        store.setPvpOpponentStatus("playing");
        if (data?.totalSafeCells) store.setPvpTotalSafeCells(data.totalSafeCells);
        store.setPvpOpponentProgress(0);
    },

    [SERVER_EVENTS.PVP_BOARD_UPDATE]: ({ board, opponentName, opponentProgress, totalSafeCells }) => {
        const store = useMinesweeperStore.getState();
        store.setBoard(board);
        if (opponentName) store.setPvpOpponentName(opponentName);
        if (opponentProgress !== undefined) store.setPvpOpponentProgress(opponentProgress);
        if (totalSafeCells !== undefined) store.setPvpTotalSafeCells(totalSafeCells);
    },

    [SERVER_EVENTS.PVP_UPDATE_CELLS]: applyCellUpdates,

    [SERVER_EVENTS.PVP_GAME_OVER]: () => {
        const store = useMinesweeperStore.getState();
        store.setGameOver(true);
        store.setPvpOpponentStatus("playing"); // Opponent might still be playing
        openDialog(DIALOGS.pvpGameOver);
    },

    [SERVER_EVENTS.PVP_OPPONENT_FAILED]: () => useMinesweeperStore.getState().setPvpOpponentStatus("failed"),
    [SERVER_EVENTS.PVP_OPPONENT_RESET]: () => useMinesweeperStore.getState().setPvpOpponentStatus("playing"),

    [SERVER_EVENTS.PVP_PLAYER_WON]: ({ winnerSocket, winnerName }) => {
        const store = useMinesweeperStore.getState();
        store.setPvpWinner(winnerName);
        store.setPvpOpponentStatus("won");

        if (socket.id === winnerSocket) {
            shootConfetti();
            store.setGameWon(true);
            openDialog(DIALOGS.pvpYouWon);
        } else {
            openDialog(DIALOGS.pvpOpponentWon);
        }
    },

    [SERVER_EVENTS.PVP_OPPONENT_PROGRESS]: ({ progress }) => useMinesweeperStore.getState().setPvpOpponentProgress(progress),

    [SERVER_EVENTS.PVP_OPPONENT_DISCONNECTED]: ({ winnerName }) => {
        const store = useMinesweeperStore.getState();
        store.setPvpWinner(winnerName);
        store.setPvpOpponentStatus("disconnected");
        shootConfetti();
        store.setGameWon(true);
        openDialog(DIALOGS.pvpOpponentDisconnected);
    },

    [SERVER_EVENTS.PVP_OPPONENT_LEFT_BEFORE_START]: () => {
        const store = useMinesweeperStore.getState();
        store.setPvpRoomReady(false);
        store.setPvpOpponentName("");
    },

    [SERVER_EVENTS.PVP_HOST_TRANSFERRED]: () => useMinesweeperStore.getState().setPvpIsHost(true),

    [SERVER_EVENTS.PVP_REMATCH_STARTED]: ({ totalSafeCells, isHost }) => {
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
export function useGameEvents(socket: AppSocket | null, leaveRoom: () => void): SocketHandlers {
    if (!socket) return {};
    return { ...coopHandlers(leaveRoom), ...pvpHandlers(socket) };
}
