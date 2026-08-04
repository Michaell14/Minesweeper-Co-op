"use client";

import { useMinesweeperStore } from "@/app/store";
import { shootConfetti } from "@/lib/confetti";
import { playSound } from "@/lib/sound";
import { cursorColorForId } from "@/lib/theme";
import { DIALOGS, openDialog, closeDialog } from "@/lib/dialogs";
import { boardKey, playersForClear, recordBestTime } from "@/lib/bestTimes";
import { elapsedSeconds } from "@/lib/gameClock";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import type { AppSocket } from "@/lib/initSocket";
import type { CellUpdate } from "@/shared/socketPayloads";
import type { SocketHandlers } from "./useSocketEvents";

/**
 * Files a completed board as a personal best.
 *
 * WIN handlers only. A loss has a time but is not a clear, and neither is
 * winning because an opponent disconnected — recording those would make the
 * number mean "the last time something ended".
 *
 * Reading the clock here rather than in the summary keeps it a one-off: a
 * component would re-run it on every render of a dialog that stays open.
 */
const recordClear = () => {
    const { startedAt, endedAt, numRows, numCols, numMines, playerStatsInRoom, mode } =
        useMinesweeperStore.getState();
    // No clock, no record. Better a missing best than an invented one.
    if (startedAt === null || endedAt === null) return;

    // The count identifies the result, so it decides the key as well as being
    // stored on it — see lib/bestTimes.ts for why a race counts as one player.
    const players = playersForClear(mode, playerStatsInRoom.length);

    useMinesweeperStore.getState().setBestTimeResult(
        recordBestTime(boardKey(numRows, numCols, numMines, players), {
            seconds: elapsedSeconds(startedAt, endedAt),
            players,
            at: endedAt,
        }),
    );
};

const applyCellUpdates = (updates: CellUpdate[]) => {
    const { setCells, setCascadeOrigin } = useMinesweeperStore.getState();
    /*
     * Where the sweep starts. `revealFrom` pushes the cell it was called on
     * first, so the first OPEN entry is the one that was clicked — for a chord
     * it is the first neighbour rather than the chorded cell, one step off and
     * indistinguishable at 14ms a band.
     *
     * Set before the cells, so the render that first shows them already has it.
     */
    const origin = updates.find((cell) => cell.isOpen);
    if (origin) setCascadeOrigin({ row: origin.row, col: origin.col });
    /*
     * The server only sends CHANGED cells, so open entries here are newly
     * opened — a batch this big means a flood fill swept the board. The
     * threshold keeps a plain reveal (1 cell) and a chord (up to ~8) on their
     * click sounds; only a real cascade gets the arpeggio. Shared by co-op,
     * PVP and daily, and it fires for a teammate's cascade too — their sweep
     * is on your board.
     */
    if (updates.filter((cell) => cell.isOpen).length > 8) playSound('cascade');
    // One write for the batch. Per cell it was one store notification each, and
    // the board rebuilt in full behind every one of them.
    setCells(updates);
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
        playSound('win');
        useMinesweeperStore.getState().setGameWon(true);
        recordClear();
        openDialog(DIALOGS.gameSummary);
    },

    [SERVER_EVENTS.GAME_OVER]: (name) => {
        playSound('lose');
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
        // A quick match arrives here and nowhere else — there is no separate
        // "match found" event, so being in a room IS the end of the search.
        // Both calls are no-ops for an ordinary join.
        store.setMatchSearching(false);
        closeDialog(DIALOGS.matchSearching);
        store.setRoom(data.room);
        if (data.mode) store.setMode(data.mode);
        if (data.isHost !== undefined) store.setPvpIsHost(data.isHost);
        // A joiner needs the room's dimensions or their flag counter is wrong.
        if (data.numRows && data.numCols && data.numMines) {
            store.setDimensions(data.numRows, data.numCols, data.numMines);
        }
        store.setPlayerJoined(true);
    },

    /*
     * The server recognised this browser and its room is still alive, so put the
     * player back rather than leaving them on the landing page. Answering with a
     * plain joinRoom is the point: a resume runs the exact path a manual join
     * does, with no second flow to keep in step.
     *
     * This fires on EVERY connect, including a socket.io auto-reconnect after a
     * dropped network — where the tab never reloaded, so `playerJoined` is still
     * true while the server has already removed the player it knew. Refusing the
     * offer there stranded the player: the UI stayed in the room, and the next
     * click failed the server's membership check and bounced them home with
     * "room does not exist". So being in THIS room is a reason to re-join, not a
     * reason to skip.
     */
    [SERVER_EVENTS.SESSION_RESUME]: ({ room, name }) => {
        const store = useMinesweeperStore.getState();
        // Daily and the resumed room are mutually exclusive views. Without this
        // guard, an offer landing while the player is on Daily sets playerJoined
        // in the background -- invisible until they leave daily and land in the
        // old room instead of on Landing. Picking daily is a real choice.
        if (store.dailyActive) return;
        // Already playing somewhere else: an offer for a different room is a
        // stale session, and taking it would move them out of the room they can
        // see. Only the room they are already in is theirs to reclaim.
        if (store.playerJoined && store.room !== room) return;

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
        playSound('lose');
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
            playSound('win');
            store.setGameWon(true);
            // Winning a race means clearing the board, so it counts.
            recordClear();
            openDialog(DIALOGS.pvpYouWon);
        } else {
            playSound('lose');
            openDialog(DIALOGS.pvpOpponentWon);
        }
    },

    [SERVER_EVENTS.PVP_OPPONENT_PROGRESS]: ({ progress }) => useMinesweeperStore.getState().setPvpOpponentProgress(progress),

    // No recordClear here on purpose: winning because the other player left is
    // not a board you finished.
    [SERVER_EVENTS.PVP_OPPONENT_DISCONNECTED]: ({ winnerName }) => {
        const store = useMinesweeperStore.getState();
        store.setPvpWinner(winnerName);
        store.setPvpOpponentStatus("disconnected");
        shootConfetti();
        playSound('win');
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
 * Matchmaking events — every one of which ENDS a search. The start is the
 * client's own `findMatch`, and a successful pairing lands as an ordinary
 * `joinRoomSuccess`, so nothing here opens the searching dialog.
 */
const matchHandlers = (): SocketHandlers => ({
    // Queued, nobody to pair with yet. The dialog is already open (see
    // `findMatch`); this only confirms the server agrees a search is running.
    [SERVER_EVENTS.MATCH_SEARCHING]: ({ othersOnline }) => {
        const store = useMinesweeperStore.getState();
        store.setMatchSearching(true);
        store.setMatchOthersOnline(othersOnline);
    },

    [SERVER_EVENTS.MATCH_CANCELLED]: () => {
        useMinesweeperStore.getState().setMatchSearching(false);
        closeDialog(DIALOGS.matchSearching);
    },

    [SERVER_EVENTS.MATCH_ERROR]: () => {
        useMinesweeperStore.getState().setMatchSearching(false);
        closeDialog(DIALOGS.matchSearching);
        openDialog(DIALOGS.matchError);
    },
});

/**
 * Daily challenge events. Not room-scoped, and mutually exclusive with the
 * coop/pvp views, so this reuses gameSlice's board/gameOver/gameWon rather than
 * a parallel daily board field.
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
        // Feeds gameSlice's shared run clock, so <Timer> works here unchanged.
        // Set in the handler, not reactively from DailyChallenge.tsx: that can
        // mount with a board already present (a resume brings both in one
        // event), so a useEffect sync would render one frame of the PREVIOUS
        // clock value first.
        store.setClock({ startedAt, endedAt: null });
    },

    /**
     * Today's attempt already ended. 'won_pending_submit' means they won but
     * never submitted a name (closed the tab before the dialog) -- reopen it
     * rather than show a dead end.
     */
    [SERVER_EVENTS.DAILY_ALREADY_ATTEMPTED]: ({ date, status, elapsedMs, rank, totalEntries, board, numRows, numCols, numMines }) => {
        const store = useMinesweeperStore.getState();
        store.setDailyActive(true);
        store.setDailyDate(date);
        store.setDailyStatus(status);
        store.setDailyElapsedMs(elapsedMs ?? null);
        store.setDailyRank(rank ?? null);
        store.setDailyTotalEntries(totalEntries ?? null);

        if (board && board.length > 0) {
            // The attempt's final board, for a VIEW-ONLY replay. Mounting it
            // recreates the state a live finish leaves behind: dimensions for
            // the flag counter's maths, gameOver on a loss so Cell.tsx draws
            // the revealed mines, and a clock frozen at the recorded time.
            // Interaction is refused upstream (see emitDailyCellAction).
            store.setBoard(board);
            if (numRows && numCols && numMines !== undefined) {
                store.setDimensions(numRows, numCols, numMines);
            }
            store.setGameOver(status === "failed");
            store.setGameWon(status !== "failed");
            if (elapsedMs !== undefined) {
                const endedAt = Date.now();
                store.setClock({ startedAt: endedAt - elapsedMs, endedAt });
            } else {
                store.setClock({ startedAt: null, endedAt: null });
            }
        } else {
            // No stored board (an attempt from before replays existed) --
            // clear any stale one (e.g. from a room played earlier this
            // session) so DailyChallenge.tsx can tell "no board" apart from
            // "board is just empty".
            store.setBoard([]);
        }

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
        playSound('lose');
        const store = useMinesweeperStore.getState();
        store.setGameOver(true); // lets Cell.tsx reveal every mine, same as coop/PVP
        store.setDailyStatus("failed");
        store.setDailyElapsedMs(elapsedMs);
        // startedAt is kept live by DAILY_STARTED and by
        // markDailyStartedOptimistically; freezing endedAt stops <Timer> at the
        // elapsedMs this event just reported.
        store.setClock({ startedAt: store.startedAt, endedAt: (store.startedAt ?? 0) + elapsedMs });
        openDialog(DIALOGS.dailyGameOver);
    },

    [SERVER_EVENTS.DAILY_WON]: ({ elapsedMs }) => {
        playSound('win');
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
 * Handlers write through `useMinesweeperStore.getState()` rather than
 * subscribing, so this hook causes no re-renders of its own — without that,
 * `page.tsx` re-renders on every remote hover event.
 */
export function useGameEvents(socket: AppSocket | null, leaveRoom: () => void): SocketHandlers {
    if (!socket) return {};
    return { ...coopHandlers(socket, leaveRoom), ...pvpHandlers(socket), ...matchHandlers(), ...dailyHandlers() };
}
