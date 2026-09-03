"use client";

import { useMinesweeperStore } from "@/app/store";
import { shootConfetti } from "@/lib/confetti";
import { playSound } from "@/lib/sound";
import { cursorColorForId } from "@/lib/theme";
import { DIALOGS, openDialog, closeDialog, type DialogId } from "@/lib/dialogs";
import { boardKey, playersForClear, recordBestTime } from "@/lib/bestTimes";
import { recordDailyResult } from "@/lib/dailyHistory";
import { diagnoseLoss } from "@/lib/lossDiagnosis";
import { elapsedSeconds } from "@/lib/gameClock";
import { practiceTargetFor } from "@/lib/practice";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import { emoteArtById } from "@/components/ds/emoteArt";
import { EMOTE_LIFETIME_MS, PING_LIFETIME_MS } from "@/lib/emotes";
import type { AppSocket } from "@/lib/initSocket";
import type { CellUpdate } from "@/shared/socketPayloads";
import type { SocketHandlers } from "./useSocketEvents";

/**
 * Files a completed board as a personal best. WIN handlers only: a loss or an
 * opponent's disconnect has a time but is not a clear. Read here rather than
 * in the summary so it runs once, not on every render of an open dialog.
 */
const recordClear = () => {
    const store = useMinesweeperStore.getState();
    const { startedAt, endedAt, numRows, numCols, numMines, playerStatsInRoom, mode } = store;
    // No clock, no record.
    if (startedAt === null || endedAt === null) return;

    // The count is part of the key — see shared/boardKeys.js for why a race counts as one.
    const players = playersForClear(mode, playerStatsInRoom.length);
    const key = boardKey(numRows, numCols, numMines, players);
    const run = { seconds: elapsedSeconds(startedAt, endedAt), players, at: endedAt };

    /*
     * Both copies. The browser's is the guest record and the fallback if the
     * stats write drops; the account's is what the summary reports when signed
     * in. The server records the same clear from its own clock and announces
     * nothing, so the account copy is updated here and replaced by the next fetch.
     */
    const local = recordBestTime(key, run);
    store.setBestTimeResult(store.recordAccountBest(key, run) ?? local);
};

const applyCellUpdates = (updates: CellUpdate[]) => {
    const { setCells, setCascadeOrigin } = useMinesweeperStore.getState();
    /*
     * Where the sweep starts: `revealFrom` pushes the clicked cell first, so the
     * first OPEN entry is the origin. Set before the cells so the first render has it.
     */
    const origin = updates.find((cell) => cell.isOpen);
    if (origin) setCascadeOrigin({ row: origin.row, col: origin.col });
    /*
     * Only CHANGED cells arrive, so a batch over 8 opens is a flood fill: a
     * reveal (1) or chord (~8) keeps its click sound, a cascade gets the arpeggio.
     */
    if (updates.filter((cell) => cell.isOpen).length > 8) playSound('cascade');
    // One store write per batch, not per cell.
    setCells(updates);
};

/**
 * Tells two emotes from the same player apart, so the second stacks instead of
 * replacing the first in React's reconciliation. A counter, not a timestamp:
 * two can land in the same millisecond.
 */
let emoteSequence = 0;
const nextEmoteKey = () => String(++emoteSequence);

/**
 * Whether a relayed reaction or ping belongs to the board on screen NOW. A
 * relay already on the wire when its recipient leaves still arrives, and would
 * otherwise draw on the room joined next. `playerJoined` matters: `room` also
 * holds whatever is being typed into the landing form.
 *
 * A payload with no room passes until this browser leaves a room: during a
 * deploy a new client talks to a server not yet sending `room`, and refusing
 * those would turn reactions off. A stale relay can only arrive after a leave,
 * so `leftARoom` closes that hole. Dead once every payload carries a room.
 */
const belongsToCurrentRoom = (
    store: { room: string; playerJoined: boolean; leftARoom: boolean },
    room: string | undefined,
) => {
    if (!store.playerJoined) return false;
    if (room === undefined) return !store.leftARoom;
    return store.room === room;
};

/**
 * Opens a game-over dialog and asks who in this room could be added. The ask
 * lives here rather than in the component: dialogs are always rendered, so a
 * component-owned fetch ran four times on room join. A guest's ask is a no-op
 * the server drops.
 */
const openSummary = (socket: AppSocket, dialog: DialogId) => {
    openDialog(dialog);
    const store = useMinesweeperStore.getState();
    if (store.room && store.playerJoined) {
        socket.emit(CLIENT_EVENTS.ROOM_FRIENDS, {
            room: store.room,
            token: store.nextRoomFriendsToken(),
        });
    }
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
        openSummary(socket, DIALOGS.gameSummary);
    },

    [SERVER_EVENTS.GAME_OVER]: (name) => {
        playSound('lose');
        const store = useMinesweeperStore.getState();
        store.setGameOver(true);
        store.setGameOverName(name);
        openSummary(socket, DIALOGS.gameSummary);
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
        // A quick match arrives here — there is no separate "match found"
        // event. Both calls are no-ops for an ordinary join.
        store.setMatchSearching(false);
        closeDialog(DIALOGS.matchSearching);
        // Ends the pending indicator on Landing.
        store.setJoinPending(null);
        store.setRoom(data.room);
        if (data.mode) store.setMode(data.mode);
        if (data.isHost !== undefined) store.setPvpIsHost(data.isHost);
        // A joiner needs the room's dimensions or their flag counter is wrong.
        if (data.numRows && data.numCols && data.numMines) {
            store.setDimensions(data.numRows, data.numCols, data.numMines);
        }
        /*
         * Resolved on arrival rather than at request time: a request is not a
         * room, and a target set at click time outlived a refused practice
         * start. Read from the room joined, an unlabelled room always clears it.
         */
        store.setPracticeTarget(
            data.practice && data.numRows && data.numCols && data.numMines !== undefined
                ? practiceTargetFor(data.numRows, data.numCols, data.numMines, store.accountBests)
                : null,
        );
        store.setPlayerJoined(true);
    },

    /*
     * The server recognised this browser and its room is still alive, so put
     * the player back. Answering with a plain joinRoom means a resume runs the
     * exact path a manual join does.
     *
     * Fires on EVERY connect, including a socket.io auto-reconnect where the
     * tab never reloaded: `playerJoined` is still true while the server has
     * dropped the player. Being in THIS room is a reason to re-join, not to skip.
     */
    [SERVER_EVENTS.SESSION_RESUME]: ({ room, name }) => {
        const store = useMinesweeperStore.getState();
        // Daily and the resumed room are mutually exclusive views: an offer
        // landing while on Daily would set playerJoined in the background.
        if (store.dailyActive) return;
        // An offer for a different room is a stale session; only the room they
        // are already in is theirs to reclaim.
        if (store.playerJoined && store.room !== room) return;

        store.setRoom(room);
        store.setName(name);
        socket.emit(CLIENT_EVENTS.JOIN_ROOM, { room, name });
    },

    [SERVER_EVENTS.JOIN_ROOM_ERROR]: () => {
        useMinesweeperStore.getState().setJoinPending(null);
        openDialog(DIALOGS.joinRoomError);
    },
    [SERVER_EVENTS.CREATE_ROOM_ERROR]: () => {
        useMinesweeperStore.getState().setJoinPending(null);
        openDialog(DIALOGS.createRoomError);
    },

    [SERVER_EVENTS.ROOM_DOES_NOT_EXIST_ERROR]: () => {
        leaveRoom(); // also clears joinPending
        openDialog(DIALOGS.roomDoesNotExist);
    },

    [SERVER_EVENTS.RECEIVE_CONFETTI]: () => shootConfetti(),

    /*
     * A reaction from anyone in the room, the sender included. `settings.emotes`
     * is the RECEIVE opt-out, applied here so an opted-out player accumulates no
     * feed state and hears no blip — their own emotes included, since the
     * setting means "no reactions on my screen".
     */
    [SERVER_EVENTS.PLAYER_EMOTE]: ({ id, name, emote, room }) => {
        const store = useMinesweeperStore.getState();
        if (!store.settings.emotes) return;
        if (!belongsToCurrentRoom(store, room)) return;
        // An id this build cannot draw is dropped — see emoteArtById.
        if (!emoteArtById(emote)) return;

        store.pushPlayerEmote({
            key: `${id}-${nextEmoteKey()}`,
            id,
            name,
            emote,
            expiresAt: Date.now() + EMOTE_LIFETIME_MS,
        });
        playSound('emote');
    },

    /*
     * Somebody pointed at a cell. Co-op only — the server suppresses it in PVP,
     * where a ping would be a move hint. Gated on the same setting as
     * reactions: one preference for "show me what other players send".
     */
    [SERVER_EVENTS.PLAYER_PING]: ({ id, name, row, col, room }) => {
        const store = useMinesweeperStore.getState();
        if (!store.settings.emotes) return;
        if (!belongsToCurrentRoom(store, room)) return;

        store.pushPlayerPing({
            key: `${id}-${nextEmoteKey()}`,
            id,
            name,
            row,
            col,
            expiresAt: Date.now() + PING_LIFETIME_MS,
        });
        playSound('emote');
    },

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

    /*
     * Queued, not shown: this lands while the summary dialog is opening.
     * <AchievementToast> drains the queue on its own schedule.
     */
    [SERVER_EVENTS.ACHIEVEMENTS_UNLOCKED]: ({ ids }) =>
        useMinesweeperStore.getState().pushUnlocked(ids),

    /*
     * --- Friends ---
     * Not room-scoped: presence and an invite into a room you are NOT in are
     * about the account.
     */
    [SERVER_EVENTS.FRIENDS_ONLINE]: ({ ids }) =>
        useMinesweeperStore.getState().setOnlineFriends(ids),

    [SERVER_EVENTS.FRIEND_PRESENCE]: ({ id, online }) =>
        useMinesweeperStore.getState().setFriendOnline(id, online),

    /* One invite at a time, newest wins: the later one is likelier to still have space. */
    [SERVER_EVENTS.FRIEND_INVITE]: (invite) =>
        useMinesweeperStore.getState().setFriendInvite(invite),

    /* Sent to this socket alone and re-sent after every add, so it is always
     * the whole truth about who here can be added.
     *
     * Dropped unless it is the NEWEST list about the room we are in NOW: emits
     * are ordered by when their Redis/Postgres work finishes, so an older one
     * can land on top of a newer one. Newer than what we HAVE, not newest of
     * what we asked: a refused request is answered with silence. Leaving
     * retires outstanding asks (`resetRoomFriends`), so nothing from a previous
     * visit to the same room passes. */
    [SERVER_EVENTS.ROOM_FRIENDS_UPDATE]: ({ room, token, players }) => {
        const store = useMinesweeperStore.getState();
        if (!store.playerJoined || store.room !== room) return;
        if (token <= store.roomFriendsSeen) return;
        store.setRoomFriends(players, token);
    },
});

/** PVP events. `socket` is needed to tell "I won" from "they won". */
const pvpHandlers = (socket: AppSocket): SocketHandlers => ({
    [SERVER_EVENTS.PVP_ROOM_FULL]: () => {
        // A refused join ends the wait just as surely as an accepted one.
        useMinesweeperStore.getState().setJoinPending(null);
        openDialog(DIALOGS.pvpRoomFull);
    },

    [SERVER_EVENTS.PVP_ROOM_READY]: (data) => {
        const store = useMinesweeperStore.getState();
        store.setPvpRoomReady(true);
        if (data?.opponentName) store.setPvpOpponentName(data.opponentName);
        if (data?.opponentAvatar !== undefined) store.setPvpOpponentAvatar(data.opponentAvatar);
        if (data?.isHost !== undefined) store.setPvpIsHost(data.isHost);
    },

    [SERVER_EVENTS.PVP_GAME_STARTED]: (data) => {
        const store = useMinesweeperStore.getState();
        store.setPvpStarted(true);
        store.setPvpOpponentStatus("playing");
        if (data?.totalSafeCells) store.setPvpTotalSafeCells(data.totalSafeCells);
        store.setPvpOpponentProgress(0);
    },

    [SERVER_EVENTS.PVP_BOARD_UPDATE]: ({ board, opponentName, opponentAvatar, opponentProgress, totalSafeCells }) => {
        const store = useMinesweeperStore.getState();
        store.setBoard(board);
        if (opponentName) store.setPvpOpponentName(opponentName);
        if (opponentAvatar !== undefined) store.setPvpOpponentAvatar(opponentAvatar);
        if (opponentProgress !== undefined) store.setPvpOpponentProgress(opponentProgress);
        if (totalSafeCells !== undefined) store.setPvpTotalSafeCells(totalSafeCells);
    },

    [SERVER_EVENTS.PVP_UPDATE_CELLS]: applyCellUpdates,

    [SERVER_EVENTS.PVP_GAME_OVER]: () => {
        playSound('lose');
        const store = useMinesweeperStore.getState();
        store.setGameOver(true);
        store.setPvpOpponentStatus("playing"); // Opponent might still be playing
        openSummary(socket, DIALOGS.pvpGameOver);
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
            openSummary(socket, DIALOGS.pvpYouWon);
        } else {
            playSound('lose');
            openSummary(socket, DIALOGS.pvpOpponentWon);
        }
    },

    [SERVER_EVENTS.PVP_OPPONENT_PROGRESS]: ({ progress }) => useMinesweeperStore.getState().setPvpOpponentProgress(progress),

    // No recordClear: winning because the other player left is not a board you finished.
    [SERVER_EVENTS.PVP_OPPONENT_DISCONNECTED]: ({ winnerName }) => {
        const store = useMinesweeperStore.getState();
        store.setPvpWinner(winnerName);
        store.setPvpOpponentStatus("disconnected");
        shootConfetti();
        playSound('win');
        store.setGameWon(true);
        openSummary(socket, DIALOGS.pvpOpponentDisconnected);
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
 * Matchmaking events, every one of which ENDS a search. The start is the
 * client's own `findMatch`, and a pairing lands as an ordinary `joinRoomSuccess`.
 */
const matchHandlers = (): SocketHandlers => ({
    // Queued, nobody to pair with yet. The dialog is already open (`findMatch`).
    [SERVER_EVENTS.MATCH_SEARCHING]: ({ othersOnline }) => {
        const store = useMinesweeperStore.getState();
        store.setMatchSearching(true);
        store.setMatchOthersOnline(othersOnline);
    },

    // Only the count: a cancel and a broadcast can cross, and this landing
    // after the dialog closed must not put the search back on.
    [SERVER_EVENTS.MATCH_ONLINE_COUNT]: ({ othersOnline }) => {
        useMinesweeperStore.getState().setMatchOthersOnline(othersOnline);
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
 * Daily challenge events. Not room-scoped and mutually exclusive with the
 * coop/pvp views, so this reuses gameSlice's board/gameOver/gameWon.
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
        store.setDailyMilestones(null);
        store.setGameOver(false);
        store.setGameWon(false);
        // Feeds gameSlice's run clock so <Timer> works unchanged. Set here, not
        // from a useEffect in DailyChallenge.tsx, which would render one frame
        // of the PREVIOUS clock first on a resume.
        store.setClock({ startedAt, endedAt: null });
    },

    /** Today's attempt already ended. 'won_pending_submit' (won, never named) reopens the submit dialog. */
    [SERVER_EVENTS.DAILY_ALREADY_ATTEMPTED]: ({ date, status, elapsedMs, rank, totalEntries, board, milestones, numRows, numCols, numMines }) => {
        const store = useMinesweeperStore.getState();
        store.setDailyActive(true);
        store.setDailyDate(date);
        store.setDailyStatus(status);
        store.setDailyElapsedMs(elapsedMs ?? null);
        store.setDailyRank(rank ?? null);
        store.setDailyTotalEntries(totalEntries ?? null);
        store.setDailyMilestones(milestones ?? null);
        // Backfills a result this browser never saw finish. First-write-wins
        // inside, so a plain resume changes nothing.
        recordDailyResult(date, { won: status !== "failed" });

        if (board && board.length > 0) {
            // The final board, for a VIEW-ONLY replay: dimensions for the flag
            // counter, gameOver so Cell.tsx draws the mines, a frozen clock.
            // Interaction is refused upstream (emitDailyCellAction).
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
            // No stored board (pre-replay attempt): clear any stale one so
            // DailyChallenge.tsx can tell "no board" from "empty board".
            store.setBoard([]);
        }

        if (status === "won_pending_submit") {
            openDialog(DIALOGS.dailySubmit);
        } else {
            openDialog(DIALOGS.dailyAlreadyPlayed);
        }
    },

    [SERVER_EVENTS.DAILY_UPDATE_CELLS]: applyCellUpdates,

    /**
     * Terminal states only, mines revealed/flagged. An open mine can only be a
     * detonation; the store still holds the pre-move position until setBoard.
     */
    [SERVER_EVENTS.DAILY_BOARD_UPDATE]: ({ board }) => {
        const store = useMinesweeperStore.getState();
        if (board.some((row) => row.some((cell) => cell.isOpen && cell.isMine))) {
            store.setDailyDiagnosis(diagnoseLoss(store.board, board));
        }
        store.setBoard(board);
    },

    [SERVER_EVENTS.DAILY_GAME_OVER]: ({ elapsedMs, milestones }) => {
        playSound('lose');
        const store = useMinesweeperStore.getState();
        store.setGameOver(true); // lets Cell.tsx reveal every mine, same as coop/PVP
        store.setDailyStatus("failed");
        store.setDailyElapsedMs(elapsedMs);
        store.setDailyMilestones(milestones ?? null);
        recordDailyResult(store.dailyDate, { won: false });
        // Freezing endedAt stops <Timer> at the elapsedMs just reported.
        store.setClock({ startedAt: store.startedAt, endedAt: (store.startedAt ?? 0) + elapsedMs });
        openDialog(DIALOGS.dailyGameOver);
    },

    [SERVER_EVENTS.DAILY_WON]: ({ elapsedMs, milestones }) => {
        playSound('win');
        const store = useMinesweeperStore.getState();
        shootConfetti();
        store.setGameWon(true);
        store.setDailyStatus("won_pending_submit");
        store.setDailyElapsedMs(elapsedMs);
        store.setDailyMilestones(milestones ?? null);
        recordDailyResult(store.dailyDate, { won: true });
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
 * The full server -> client event table. Handlers write through
 * `useMinesweeperStore.getState()` rather than subscribing, so this hook
 * causes no re-renders of its own.
 */
export function useGameEvents(socket: AppSocket | null, leaveRoom: () => void): SocketHandlers {
    if (!socket) return {};
    return { ...coopHandlers(socket, leaveRoom), ...pvpHandlers(socket), ...matchHandlers(), ...dailyHandlers() };
}
