/**
 * The socket protocol's payload shapes — the one copy.
 *
 * `shared/events.js` single-sourced the event NAMES, which stopped a typo
 * producing an event nobody listens to. It said nothing about what travels with
 * them: the shapes lived in ARCHITECTURE.md §4 as prose and were re-declared,
 * inline and by hand, at each handler in `hooks/useGameEvents.ts`. So a payload
 * could be read as the wrong shape and nothing complained.
 *
 * Typing them here makes the client's emits and handlers checked by tsc, and
 * gives one place to read the protocol.
 *
 * ## What this does and does not enforce
 *
 * This is a `.ts` file, so only the CLIENT consumes it — the server is plain
 * CommonJS and cannot import a type. That means:
 *
 *   - client emits and handlers ARE checked against these shapes, at compile time
 *   - the server is NOT, and could still emit something else
 *
 * `server/tests/events.test.js` checks that every name in `shared/events.js`
 * appears here, so an event can't be added without a declared payload. It cannot
 * check the shapes themselves; the server's own guard for inbound payloads is
 * `server/validation.js`. Keep this file in step with what the server emits by
 * hand — it is the one part of the protocol still held together by care.
 *
 * Sibling of `shared/events.js` and `shared/boardConfig.js`; unlike those two it
 * is never required by the server, so it costs nothing at runtime.
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
}
