"use client";

import { useMinesweeperStore } from "@/app/store";
import { shootConfetti } from "@/lib/confetti";
import { cursorColorForId } from "@/lib/theme";
import { DIALOGS, openDialog, closeDialog } from "@/lib/dialogs";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
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
const coopHandlers = (socket: AppSocket, leaveRoom: () => void): SocketHandlers => ({
    // --- Game state ---
    [SERVER_EVENTS.BOARD_UPDATE]: (board) => useMinesweeperStore.getState().setBoard(board),

    [SERVER_EVENTS.UPDATE_CELLS]: applyCellUpdates,

    [SERVER_EVENTS.PLAYER_STATS_UPDATE]: (stats) => useMinesweeperStore.getState().setPlayerStatsInRoom(stats),

    // Sent on start, on finish, and to anyone arriving mid-run.
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

    /*
     * The server recognised this browser and its room is still alive, so put the
     * player back rather than leaving them on the landing page.
     *
     * Answering with a plain joinRoom is the point: a resume then runs the exact
     * path a manual join does — same validation, same board, same clock — with
     * no second flow to keep in step. The server only makes this offer when the
     * player did not leave deliberately.
     */
    [SERVER_EVENTS.SESSION_RESUME]: ({ room, name }) => {
        const store = useMinesweeperStore.getState();
        // The daily challenge and the resumed room are mutually exclusive
        // views (see app/page.tsx). Without this guard, a resume offer that
        // lands while the player is on the Daily Challenge (this only fires
        // once per connection, so the race is real, not hypothetical) sets
        // playerJoined in the background -- invisible until they later leave
        // daily and land back in the old room instead of on Landing. Choosing
        // the daily challenge over a passive resume is a real choice; it
        // should not be silently overridden.
        if (store.playerJoined || store.dailyActive) return;

        store.setRoom(room);
        store.setName(name);
        socket.emit(CLIENT_EVENTS.JOIN_ROOM, { room, name });
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
 * Daily challenge events. Not room-scoped, and mutually exclusive with the
 * coop/pvp views, so this reuses gameSlice's board/gameOver/gameWon directly
 * rather than a parallel daily board field — see components/DailyChallenge.tsx.
 */
const dailyHandlers = (): SocketHandlers => ({
    [SERVER_EVENTS.DAILY_STARTED]: ({ date, board, numRows, numCols, numMines, totalSafeCells, startedAt }) => {
        const store = useMinesweeperStore.getState();
        store.setDailyActive(true);
        store.setDailyDate(date);
        store.setBoard(board);
        store.setDimensions(numRows, numCols, numMines); // so FlagCounter's remainingFlags matches this board
        store.setDailyTotalSafeCells(totalSafeCells);
        store.setDailyStatus(startedAt !== null ? "in_progress" : "ready");
        store.setDailyElapsedMs(null);
        store.setDailyRank(null);
        store.setDailyTotalEntries(null);
        store.setGameOver(false);
        store.setGameWon(false);
        // Feeds gameSlice's shared run clock (see state/gameSlice.ts) so
        // <Timer> -- the same component Grid.tsx uses for co-op/PVP -- just
        // works here too. Set directly in the handler, not reactively from
        // within DailyChallenge.tsx: that component can mount with a board
        // already present (a resume arrives with both in one event), so a
        // useEffect-based sync would render one frame of gameSlice's PREVIOUS
        // clock value before catching up.
        store.setClock({ startedAt, endedAt: null });
    },

    /**
     * Today's attempt already reached a terminal state. 'won_pending_submit'
     * means the player won but never submitted a name (e.g. closed the tab
     * before the submit dialog) -- reopen it rather than showing a dead end.
     */
    [SERVER_EVENTS.DAILY_ALREADY_ATTEMPTED]: ({ date, status, elapsedMs, rank, totalEntries }) => {
        const store = useMinesweeperStore.getState();
        store.setDailyActive(true);
        store.setDailyDate(date);
        store.setDailyStatus(status);
        store.setDailyElapsedMs(elapsedMs ?? null);
        store.setDailyRank(rank ?? null);
        store.setDailyTotalEntries(totalEntries ?? null);
        // No board comes with this event -- clear any stale one (e.g. left
        // over from a room played earlier this session) so DailyChallenge.tsx
        // can tell "no board available" apart from "board is just empty".
        store.setBoard([]);

        if (status === "won_pending_submit") {
            openDialog(DIALOGS.dailySubmit);
        } else {
            openDialog(DIALOGS.dailyAlreadyPlayed);
        }
    },

    [SERVER_EVENTS.DAILY_UPDATE_CELLS]: applyCellUpdates,

    /** Terminal states only -- the full board, with mines revealed/flagged. */
    [SERVER_EVENTS.DAILY_BOARD_UPDATE]: ({ board }) => useMinesweeperStore.getState().setBoard(board),

    [SERVER_EVENTS.DAILY_GAME_OVER]: ({ elapsedMs }) => {
        const store = useMinesweeperStore.getState();
        store.setGameOver(true); // lets Cell.tsx reveal every mine, same as coop/PVP
        store.setDailyStatus("failed");
        store.setDailyElapsedMs(elapsedMs);
        // gameSlice's startedAt is kept live by DAILY_STARTED (resume) and
        // markDailyStartedOptimistically (see hooks/useGameActions.ts, fired
        // on the player's own first open/chord). Freezing endedAt stops
        // <Timer> and agrees with the elapsedMs this event just reported.
        store.setClock({ startedAt: store.startedAt, endedAt: (store.startedAt ?? 0) + elapsedMs });
        openDialog(DIALOGS.dailyGameOver);
    },

    [SERVER_EVENTS.DAILY_WON]: ({ elapsedMs }) => {
        const store = useMinesweeperStore.getState();
        shootConfetti();
        store.setGameWon(true);
        store.setDailyStatus("won_pending_submit");
        store.setDailyElapsedMs(elapsedMs);
        store.setClock({ startedAt: store.startedAt, endedAt: (store.startedAt ?? 0) + elapsedMs });
        openDialog(DIALOGS.dailySubmit);
    },

    [SERVER_EVENTS.DAILY_SCORE_SUBMITTED]: ({ rank, elapsedMs, totalEntries }) => {
        const store = useMinesweeperStore.getState();
        store.setDailyStatus("completed");
        store.setDailyRank(rank);
        store.setDailyElapsedMs(elapsedMs);
        store.setDailyTotalEntries(totalEntries);
        closeDialog(DIALOGS.dailySubmit);
        openDialog(DIALOGS.dailyLeaderboard);
    },

    [SERVER_EVENTS.DAILY_LEADERBOARD_UPDATE]: ({ entries }) => useMinesweeperStore.getState().setDailyLeaderboard(entries),
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
    return { ...coopHandlers(socket, leaveRoom), ...pvpHandlers(socket), ...dailyHandlers() };
}
