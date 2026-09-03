/**
 * The socket protocol's payload shapes. `shared/events.js` owns the NAMES; this
 * covers what travels with them. A `.ts` file, so only the client is checked at
 * compile time: the server is CommonJS, validates inbound payloads with
 * `server/validation.js`, and keeps its emits in step by hand.
 * `server/tests/events.test.js` only checks that every event name appears here.
 */

/** Which game a room is playing. `server/validation.js` accepts exactly these. */
export type GameMode = 'co-op' | 'pvp';

/**
 * A cell over the wire. Closed cells are projected (`isMine` false, `nearbyMines`
 * 0) so a client cannot read the board off the payload. ARCHITECTURE.md §3.1.
 */
export interface Cell {
    isMine: boolean;
    isOpen: boolean;
    isFlagged: boolean;
    nearbyMines: number;
}

/** A cell plus where it is, as sent by `updateCells` / `pvpUpdateCells`. */
export type CellUpdate = Cell & { row: number; col: number };

/** One row of the daily challenge leaderboard, fastest first. */
export interface DailyLeaderboardEntry {
    name: string;
    /** Avatar id (shared/avatars.js), null for anonymous. Optional across deploy skew. */
    avatar?: string | null;
    elapsedMs: number;
    rank: number;
}

/** An attempt already reached a terminal state today; no fresh board to give. */
export type DailyAttemptStatus = 'failed' | 'won_pending_submit' | 'completed';

/** One row of the co-op leaderboard. */
export interface PlayerStats {
    name: string;
    /** Avatar id, null for anonymous players. Optional across deploy skew. */
    avatar?: string | null;
    score: number;
}

/** Winner identity, sent both on a win and on an opponent's disconnect. */
export interface WinnerPayload {
    winnerSocket: string;
    winnerName: string;
}

/** Every payload that is just a room code. */
interface RoomPayload {
    room: string;
}

/** Every payload that is a room code plus a cell. */
interface CellPayload extends RoomPayload {
    row: number;
    col: number;
}

/**
 * Token and start date echoed back from `dailyStarted`, never "today" recomputed,
 * so an attempt spanning UTC midnight stays pinned to its own day.
 */
interface DailyPayload {
    dailyAttemptToken: string;
    date: string;
}

interface DailyCellPayload extends DailyPayload {
    row: number;
    col: number;
}

/** Client -> server. Each key is a server route and an emit in `hooks/useGameActions.ts`. */
export interface ClientToServerEvents {
    createRoom: (payload: {
        room: string;
        numRows: number;
        numCols: number;
        numMines: number;
        name: string;
        mode: GameMode;
    }) => void;
    joinRoom: (payload: { room: string; name: string }) => void;

    openCell: (payload: CellPayload) => void;
    chordCell: (payload: CellPayload) => void;
    toggleFlag: (payload: CellPayload) => void;
    /** `row: -1, col: -1` clears this player's hover. */
    cellHover: (payload: CellPayload) => void;

    emitConfetti: (payload: RoomPayload) => void;
    /** `emote` is an id from shared/emotes.js — never free text. */
    sendEmote: (payload: { room: string; emote: string }) => void;
    /** "Look at this cell". Co-op only — the server suppresses it in PVP. */
    pingCell: (payload: CellPayload) => void;
    /** Ask a friend to join the room this socket is in. */
    inviteFriend: (payload: { friendId: string; room: string }) => void;
    /** `token` is the client's counter, echoed on the reply so a superseded list can be dropped. */
    roomFriends: (payload: { room: string; token: number }) => void;
    /** `playerId` is the co-player's SOCKET id — account ids never leave the server. */
    addRoomFriend: (payload: { room: string; playerId: string; token: number }) => void;
    resetGame: (payload: RoomPayload) => void;

    startPvpGame: (payload: RoomPayload) => void;
    resetMyBoard: (payload: RoomPayload) => void;
    pvpRematch: (payload: RoomPayload) => void;

    /** The only emit with no payload — the server uses the socket id. */
    playerLeave: () => void;

    // --- Matchmaking ---
    /** Join the quick-match queue. No room code: there is no room yet. */
    findMatch: (payload: { name: string }) => void;
    /** Leave the queue. Like `playerLeave`, the socket id is the whole payload. */
    cancelMatch: () => void;
    /**
     * Leave the queue for a solo board racing a target time. Answered with an
     * ordinary `joinRoomSuccess` for a co-op room of one; the target never
     * reaches the server. See ARCHITECTURE.md §5.
     */
    startPracticeRace: (payload: { name: string }) => void;

    // --- Daily challenge ---
    startDaily: (payload: { dailyAttemptToken: string }) => void;
    dailyOpenCell: (payload: DailyCellPayload) => void;
    dailyChordCell: (payload: DailyCellPayload) => void;
    dailyToggleFlag: (payload: DailyCellPayload) => void;
    submitDailyScore: (payload: DailyPayload & { name: string }) => void;
    getDailyLeaderboard: (payload: { date: string }) => void;
}

/** Server -> client. Every key has a handler in the table in `hooks/useGameEvents.ts`. */
export interface ServerToClientEvents {
    // --- Room lifecycle ---
    joinRoomSuccess: (payload: {
        room: string;
        mode?: GameMode;
        isHost?: boolean;
        /** Sent to a JOINING player so their flag counter matches the room. */
        numRows?: number;
        numCols?: number;
        numMines?: number;
        /**
         * Opened by `startPracticeRace`; the client draws a target time. Room
         * configuration like `mode`: the target itself comes from the player's
         * own records and is never server-side (ARCHITECTURE.md §5). Sent on
         * every join so a reload rides back in on it. The client cannot infer
         * it, since a practice request can be answered with a real match.
         */
        practice?: boolean;
    }) => void;
    joinRoomError: () => void;
    createRoomError: () => void;
    roomDoesNotExistError: () => void;

    // --- Board and scores ---
    /** The whole board: join, reset, first click, win, loss. Projected. */
    boardUpdate: (board: Cell[][]) => void;
    updateCells: (updates: CellUpdate[]) => void;
    playerStatsUpdate: (stats: PlayerStats[]) => void;

    // --- Win / loss ---
    gameWon: () => void;
    /** Carries the name of whoever hit the mine, not a room code. */
    gameOver: (playerName: string) => void;
    resetEveryone: () => void;

    // --- Presence and fun ---
    receiveConfetti: () => void;
    /**
     * Somebody reacted. Sent to everyone including the sender, like confetti.
     * `room` is optional only for deploy skew; see belongsToCurrentRoom.
     */
    playerEmote: (payload: { id: string; name: string; emote: string; room?: string }) => void;
    /**
     * Somebody pointed at a cell. Co-op only, like hover: PVP racers share a
     * board, so a ping is a move hint. `room` says which board the cell belongs
     * to, since a relay in flight when its recipient leaves is still delivered
     * (see useGameEvents). Optional only for deploy skew.
     */
    playerPing: (payload: { id: string; name: string; row: number; col: number; room?: string }) => void;

    // --- Friends ---
    /** Which friends were already here, sent to a socket as it arrives. */
    friendsOnline: (payload: { ids: string[] }) => void;
    /** One friend came or went. A delta — see server/utils/presence.js. */
    friendPresence: (payload: { id: string; online: boolean }) => void;
    /** A friend asked you into their room. */
    friendInvite: (payload: {
        fromId: string;
        fromName: string;
        fromAvatar: string | null;
        room: string;
        mode: GameMode;
    }) => void;
    /**
     * Signed-in players in this room, to the asker alone; "me" is excluded
     * server-side and a guest gets nothing. The whole list is re-sent after
     * every add so the client never merges two sources of truth.
     */
    roomFriendsUpdate: (payload: {
        /**
         * Emits are ordered by when server-side work finishes, so an older
         * list can arrive after a newer one; the client drops it by room and token.
         */
        room: string;
        token: number;
        players: {
            /** SOCKET id. The account id is never sent. */
            id: string;
            name: string;
            avatar: string | null;
            status: 'none' | 'requested' | 'incoming' | 'friends';
        }[];
    }) => void;
    /** Co-op only; the server suppresses hover in PVP. */
    playerHoverUpdate: (payload: { id: string; row: number; col: number; name: string }) => void;
    /**
     * The room's clock as epoch ms. The client ticks locally from `startedAt`,
     * so nothing streams per second and a late join or reload picks it up at
     * the right time. `startedAt` is null before the first reveal, `endedAt`
     * null until the game ends.
     */
    gameClock: (payload: { startedAt: number | null; endedAt: number | null }) => void;
    /**
     * Sent on connect when the handshake's session id still maps to a live
     * room; the client answers with a normal `joinRoom`. Never sent after a
     * deliberate leave, which clears the room from the session.
     */
    sessionResume: (payload: { room: string; name: string }) => void;
    playerLeft: (socketId: string) => void;
    /**
     * Catalog ids from shared/achievements.js, only the NEW ones (what ON
     * CONFLICT let through). An unknown id is skipped, not rendered raw.
     */
    achievementsUnlocked: (payload: { ids: string[] }) => void;

    // --- PVP ---
    pvpRoomFull: () => void;
    pvpRoomReady: (payload: {
        opponentName?: string;
        /** Opponent's avatar id, null for anonymous. Optional across deploy skew. */
        opponentAvatar?: string | null;
        isHost?: boolean;
    }) => void;
    pvpGameStarted: (payload: { totalSafeCells?: number }) => void;
    /** Both players get the SAME board (ARCHITECTURE.md §5); `playerIndex` says which side. */
    pvpBoardUpdate: (payload: {
        board: Cell[][];
        playerIndex: number;
        opponentName?: string;
        opponentAvatar?: string | null;
        opponentProgress?: number;
        totalSafeCells?: number;
    }) => void;
    pvpUpdateCells: (updates: CellUpdate[]) => void;
    /** Sent only to the player who hit a mine. */
    pvpGameOver: () => void;
    pvpOpponentFailed: () => void;
    pvpOpponentReset: () => void;
    pvpPlayerWon: (payload: WinnerPayload) => void;
    pvpOpponentProgress: (payload: {
        progress: number;
        totalSafeCells: number;
        percentage: number;
    }) => void;
    pvpOpponentDisconnected: (payload: WinnerPayload) => void;
    pvpOpponentLeftBeforeStart: () => void;
    pvpHostTransferred: () => void;
    pvpRematchStarted: (payload: { totalSafeCells: number; isHost: boolean }) => void;

    // --- Matchmaking ---
    /**
     * Queued, nobody to pair with yet. No `matchFound`: a pairing arrives as the
     * ordinary `joinRoomSuccess` + `pvpRoomReady`. `othersOnline` is connected
     * sockets minus this one, not a queue depth: the queue never holds two
     * waiting players, so "is anyone here" is the only number that matters.
     */
    matchSearching: (payload: { othersOnline: number }) => void;
    /**
     * `othersOnline` again, pushed to the queue whenever a socket connects or
     * disconnects, since `matchSearching` fires once and the dialog can sit
     * open for minutes. A separate event because it must carry no verdict about
     * the search: a cancel and a re-broadcast can cross.
     */
    matchOnlineCount: (payload: { othersOnline: number }) => void;
    /** Removed from the queue — the player's own cancel, or a leave/disconnect. */
    matchCancelled: () => void;
    /** The search could not proceed. Ends the wait rather than spinning forever. */
    matchError: () => void;

    // --- Daily challenge ---
    dailyStarted: (payload: {
        date: string;
        board: Cell[][];
        numRows: number;
        numCols: number;
        numMines: number;
        totalSafeCells: number;
        /** null for a fresh start; populated when resuming an in-progress attempt. */
        startedAt: number | null;
    }) => void;
    /** Today's attempt already reached a terminal state; the final board comes for a view-only replay. */
    dailyAlreadyAttempted: (payload: {
        date: string;
        status: DailyAttemptStatus;
        elapsedMs?: number;
        rank?: number;
        /** Only present alongside `rank`, when status is 'completed'. */
        totalEntries?: number;
        /** FINAL board, mines revealed (terminal, ARCHITECTURE.md §3.1). Absent on older attempts. */
        board?: Cell[][];
        /** Pace milestones for the share bar (see dailyWon). Absent on older attempts. */
        milestones?: number[];
        numRows?: number;
        numCols?: number;
        numMines?: number;
    }) => void;
    dailyUpdateCells: (updates: CellUpdate[]) => void;
    /** Terminal states only (loss or win) -- the full board, mines revealed. */
    dailyBoardUpdate: (payload: { board: Cell[][] }) => void;
    dailyGameOver: (payload: { elapsedMs: number; milestones?: number[] }) => void;
    /**
     * `milestones[i]` is the server-stamped elapsedMs when (i+1)/10 of the safe
     * cells were first open: 10 on a win, fewer on a loss. Timing only, nothing
     * positional, since the board is the same for everyone (lib/dailyShare.ts).
     */
    dailyWon: (payload: { elapsedMs: number; milestones?: number[] }) => void;
    dailyScoreSubmitted: (payload: { rank: number; elapsedMs: number; totalEntries: number }) => void;
    dailyLeaderboardUpdate: (payload: { entries: DailyLeaderboardEntry[] }) => void;
}
