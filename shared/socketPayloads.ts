/**
 * The socket protocol's payload shapes — the one copy, and one place to read the
 * protocol. `shared/events.js` single-sources the event NAMES; this covers what
 * travels with them.
 *
 * ## What this does and does not enforce
 *
 * A `.ts` file, so only the CLIENT consumes it — the server is CommonJS and
 * cannot import a type. Client emits and handlers ARE checked at compile time;
 * the server is NOT, and could still emit something else.
 *
 * `server/tests/events.test.js` checks that every name in `shared/events.js`
 * appears here, so no event can be added without a declared payload. It cannot
 * check the shapes themselves — the server's guard for INBOUND payloads is
 * `server/validation.js`, and its emits are kept in step here by hand.
 */

/** Which game a room is playing. `server/validation.js` accepts exactly these. */
export type GameMode = 'co-op' | 'pvp';

/**
 * A single cell as it arrives over the wire.
 *
 * Closed cells are projected: `isMine` false and `nearbyMines` 0 regardless of
 * the truth, so a client cannot read the board off the payload. See
 * ARCHITECTURE.md §3.1.
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
    elapsedMs: number;
    rank: number;
}

/** An attempt already reached a terminal state today; no fresh board to give. */
export type DailyAttemptStatus = 'failed' | 'won_pending_submit' | 'completed';

/** One row of the co-op leaderboard. */
export interface PlayerStats {
    name: string;
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
 * Every daily payload after `startDaily` carries the attempt token and the date
 * it started under, echoed back from `dailyStarted` — never "today" recomputed
 * per event, so an attempt spanning UTC midnight stays pinned to its own day.
 */
interface DailyPayload {
    dailyAttemptToken: string;
    date: string;
}

interface DailyCellPayload extends DailyPayload {
    row: number;
    col: number;
}

/**
 * Client -> server.
 *
 * Every key is a `socket.on` handler in `server/server.js`, and every one of
 * these is emitted from `hooks/useGameActions.ts`.
 */
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
    resetGame: (payload: RoomPayload) => void;

    startPvpGame: (payload: RoomPayload) => void;
    resetMyBoard: (payload: RoomPayload) => void;
    pvpRematch: (payload: RoomPayload) => void;

    /** The only emit with no payload — the server uses the socket id. */
    playerLeave: () => void;

    // --- Daily challenge ---
    startDaily: (payload: { dailyAttemptToken: string }) => void;
    dailyOpenCell: (payload: DailyCellPayload) => void;
    dailyChordCell: (payload: DailyCellPayload) => void;
    dailyToggleFlag: (payload: DailyCellPayload) => void;
    submitDailyScore: (payload: DailyPayload & { name: string }) => void;
    getDailyLeaderboard: (payload: { date: string }) => void;
}

/**
 * Server -> client.
 *
 * Every key has a handler in the table in `hooks/useGameEvents.ts`.
 */
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
    /** Co-op only; the server suppresses hover in PVP. */
    playerHoverUpdate: (payload: { id: string; row: number; col: number; name: string }) => void;
    /**
     * The room's clock, as epoch milliseconds.
     *
     * Timestamps rather than an elapsed count: the client ticks locally from
     * `startedAt`, so nothing is streamed per second, every player in a co-op
     * room reads the same clock, and anyone arriving mid-run — a late join, a
     * reconnect, a reload that resumes — picks it up at the right time.
     *
     * `startedAt` is null before the first cell is revealed; `endedAt` is null
     * until the game ends.
     */
    gameClock: (payload: { startedAt: number | null; endedAt: number | null }) => void;
    /**
     * "You were in a room, and it is still there." Sent on connect when the
     * handshake's session id still maps to a live room. The client answers with
     * a normal `joinRoom`, so a resume runs the same path a manual join does.
     *
     * Never sent after a deliberate leave — that clears the room from the
     * session, so this cannot drag someone back into a game they walked away from.
     */
    sessionResume: (payload: { room: string; name: string }) => void;
    playerLeft: (socketId: string) => void;

    // --- PVP ---
    pvpRoomFull: () => void;
    pvpRoomReady: (payload: { opponentName?: string; isHost?: boolean }) => void;
    pvpGameStarted: (payload: { totalSafeCells?: number }) => void;
    /**
     * Both players get the SAME board — see ARCHITECTURE.md §5. `playerIndex`
     * tells a client which side it is, not which board it got.
     */
    pvpBoardUpdate: (payload: {
        board: Cell[][];
        playerIndex: number;
        opponentName?: string;
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
    /** Today's attempt already reached a terminal state. The final board is
     * included when available, for a view-only replay -- never a fresh one. */
    dailyAlreadyAttempted: (payload: {
        date: string;
        status: DailyAttemptStatus;
        elapsedMs?: number;
        rank?: number;
        /** Only present alongside `rank`, when status is 'completed'. */
        totalEntries?: number;
        /**
         * The attempt's FINAL board, mines revealed, for a view-only replay.
         * A terminal state may show everything (ARCHITECTURE.md §3.1).
         * Optional: attempts recorded before this field existed have none.
         */
        board?: Cell[][];
        numRows?: number;
        numCols?: number;
        numMines?: number;
    }) => void;
    dailyUpdateCells: (updates: CellUpdate[]) => void;
    /** Terminal states only (loss or win) -- the full board, mines revealed. */
    dailyBoardUpdate: (payload: { board: Cell[][] }) => void;
    dailyGameOver: (payload: { elapsedMs: number }) => void;
    dailyWon: (payload: { elapsedMs: number }) => void;
    dailyScoreSubmitted: (payload: { rank: number; elapsedMs: number; totalEntries: number }) => void;
    dailyLeaderboardUpdate: (payload: { entries: DailyLeaderboardEntry[] }) => void;
}
