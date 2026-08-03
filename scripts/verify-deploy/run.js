/**
 * Post-deploy smoke test: does the DEPLOYED backend actually behave?
 *
 * `npm test` mocks Redis and io, and `npm run test:ui` drives a local stack.
 * Neither says anything about production. This connects a real socket.io client
 * to a running backend and plays enough of a game to prove the rules that matter
 * still hold — the two that are invisible from the outside and expensive to get
 * wrong:
 *
 *   1. PVP deals both players the SAME board (ARCHITECTURE.md §5), with the
 *      shared opening already revealed and no mine positions in the payload.
 *   2. Scoring is one point per cell opened, in both modes (§8).
 *
 * It also re-checks the projection guarantee — that a client is never sent mine
 * positions for closed cells — which is the one bug here that was a security
 * issue rather than a gameplay one.
 *
 * Usage:
 *   npm run verify:deploy                    # against production
 *   VERIFY_SERVER=http://localhost:3001 npm run verify:deploy
 *
 * This creates real rooms on the target. They are ordinary short-lived rooms
 * with random codes, the same as any player would make, and nothing is left
 * running — but it is not a read-only check, so point it at a backend you own.
 */

const { io } = require('socket.io-client');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('../../shared/events');

const SERVER =
    process.env.VERIFY_SERVER || 'https://nameless-coast-33840-33c3fd45fe2d.herokuapp.com';

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

let failures = 0;
const check = (condition, label, detail) => {
    if (condition) {
        console.log(`  ${green('PASS')}  ${label}`);
    } else {
        failures++;
        console.log(`  ${red('FAIL')}  ${label}`);
        if (detail) console.log(`        ${detail}`);
    }
};

const connect = () =>
    new Promise((resolve, reject) => {
        const socket = io(SERVER, { transports: ['websocket'], reconnection: false, timeout: 20000 });
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', (err) => reject(new Error(`cannot reach ${SERVER}: ${err.message}`)));
    });

/**
 * Resolves with an event's payload.
 *
 * Takes args[0] deliberately: socket.io hands the listener every argument, and
 * returning the whole array when there happened to be more than one produced a
 * payload that looked like a board and wasn't. That mistake cost real debugging
 * time, so it is pinned here rather than left to the caller.
 */
const once = (socket, event, ms = 20000) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), ms);
        socket.once(event, (...args) => {
            clearTimeout(timer);
            resolve(args[0]);
        });
    });

const roomCode = () => `vd${Math.floor(Math.random() * 90000 + 10000)}`;
const BOARD = { numRows: 16, numCols: 16, numMines: 40 };

/**
 * Plays one cell and describes what came back.
 *
 * Comparing the two pvpBoardUpdate payloads is NOT enough on its own:
 * startPvpGame emits the shared board it just built, so those payloads match
 * even if the boards actually STORED for the two players differ. (Verified —
 * dealing player 2 their own board again passes a payload-only check.) Playing a
 * cell is what reads the stored board back, so this is the check with teeth.
 *
 * Resolves to null on silence, so a player whose board has the cell already open
 * is reported as a difference rather than hanging the run.
 */
const probeCell = (socket, room, row, col, ms = 4000) =>
    new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        const done = (value) => { clearTimeout(timer); resolve(value); };
        socket.once(SERVER_EVENTS.PVP_UPDATE_CELLS, (updates) =>
            // Order is not part of the contract; sort so only content matters.
            done(
                [...updates]
                    .map((c) => `${c.row},${c.col},${c.isOpen},${c.isFlagged},${c.nearbyMines}`)
                    .sort()
                    .join(' | ')
            )
        );
        socket.once(SERVER_EVENTS.PVP_GAME_OVER, () => done('hit a mine'));
        socket.emit(CLIENT_EVENTS.OPEN_CELL, { room, row, col });
    });

/** Both players race one board, already opened, with no mines in the payload. */
async function verifyPvp() {
    console.log(bold('\n--- PVP: one shared board ---'));
    const host = await connect();
    const guest = await connect();

    try {
        const room = roomCode();
        const ready = once(host, SERVER_EVENTS.PVP_ROOM_READY);

        host.emit(CLIENT_EVENTS.CREATE_ROOM, { room, ...BOARD, name: 'VerifyHost', mode: 'pvp' });
        await once(host, SERVER_EVENTS.JOIN_ROOM_SUCCESS);
        guest.emit(CLIENT_EVENTS.JOIN_ROOM, { room, name: 'VerifyGuest' });
        await once(guest, SERVER_EVENTS.JOIN_ROOM_SUCCESS);
        await ready;

        // Register both listeners BEFORE starting, or the faster one is missed.
        const hostBoard = once(host, SERVER_EVENTS.PVP_BOARD_UPDATE);
        const guestBoard = once(guest, SERVER_EVENTS.PVP_BOARD_UPDATE);
        host.emit(CLIENT_EVENTS.START_PVP_GAME, { room });
        const hostPayload = await hostBoard;
        const guestPayload = await guestBoard;

        check(
            JSON.stringify(hostPayload.board) === JSON.stringify(guestPayload.board),
            'both players receive an identical board'
        );
        check(
            hostPayload.playerIndex === 0 && guestPayload.playerIndex === 1,
            'each player is told which side they are',
            `got ${hostPayload.playerIndex} and ${guestPayload.playerIndex}`
        );

        const cells = hostPayload.board.flat();
        const opened = cells.filter((cell) => cell.isOpen).length;
        check(opened > 0, `the shared opening is already revealed (${opened} cells)`);
        check(
            cells.every((cell) => cell.isMine === false),
            'no mine positions in the payload',
            'closed cells must be projected — see ARCHITECTURE.md §3.1'
        );

        const centre = hostPayload.board[Math.floor(BOARD.numRows / 2)][Math.floor(BOARD.numCols / 2)];
        check(centre.isOpen === true, 'the shared start cell is open for both players');

        // The boards each player will actually PLAY, not just the ones they were
        // shown. Same closed cell for both; identical boards must answer alike.
        let target = null;
        hostPayload.board.forEach((cells, row) =>
            cells.forEach((cell, col) => {
                if (!target && !cell.isOpen) target = { row, col };
            })
        );
        const [hostResult, guestResult] = await Promise.all([
            probeCell(host, room, target.row, target.col),
            probeCell(guest, room, target.row, target.col),
        ]);
        check(
            hostResult !== null && hostResult === guestResult,
            `playing the same cell gives both players the same result (${target.row},${target.col})`,
            `host: ${hostResult}\n        guest: ${guestResult}\n        the STORED boards differ, even though the payloads matched`
        );
    } finally {
        host.disconnect();
        guest.disconnect();
    }
}

/** A move scores one point per cell it opens, cascades included. */
async function verifyScoring() {
    console.log(bold('\n--- CO-OP: a point per cell opened ---'));
    const player = await connect();

    try {
        const room = roomCode();
        // 'co-op', not 'coop' — server/validation.js accepts exactly these two.
        player.emit(CLIENT_EVENTS.CREATE_ROOM, { room, ...BOARD, name: 'Verify', mode: 'co-op' });
        await once(player, SERVER_EVENTS.JOIN_ROOM_SUCCESS);

        const boardUpdate = once(player, SERVER_EVENTS.BOARD_UPDATE);
        const statsUpdate = once(player, SERVER_EVENTS.PLAYER_STATS_UPDATE);
        player.emit(CLIENT_EVENTS.OPEN_CELL, { room, row: 8, col: 8 });
        const board = await boardUpdate;
        const stats = await statsUpdate;

        const revealed = board.flat().filter((cell) => cell.isOpen).length;
        const score = stats[0] && parseInt(stats[0].score, 10);

        check(revealed > 1, `the first click cascaded (${revealed} cells)`, 'expected a cascade to make the check meaningful');
        check(
            score === revealed,
            `scored a point per cell revealed (${score} for ${revealed})`,
            `one point per click would report 1; got ${score}`
        );
        check(
            board.flat().every((cell) => cell.isMine === false),
            'the co-op board carries no mine positions either'
        );
    } finally {
        player.disconnect();
    }
}

/**
 * The account API surface, without an account: an unauthenticated GET /api/me
 * must answer 401 (auth configured and mounted) or 503 (mounted, database not
 * provisioned). Anything else — 404 especially — means the routes never made
 * it into the deploy.
 */
async function verifyAccountApi() {
    console.log(bold('\n--- ACCOUNT API ---'));
    try {
        const res = await fetch(`${SERVER}/api/me`);
        check(
            res.status === 401 || res.status === 503,
            `the account routes are mounted (got ${res.status})`,
            '404 would mean the /api surface is missing from this deploy'
        );
    } catch (error) {
        check(false, 'the account routes are reachable', error.message);
    }
}

(async () => {
    console.log(`\nVerifying ${bold(SERVER)}`);
    await verifyPvp();
    await verifyScoring();
    await verifyAccountApi();

    console.log(
        failures ? red(`\n${failures} CHECK(S) FAILED`) : green('\nALL DEPLOY CHECKS PASSED')
    );
    process.exit(failures ? 1 : 0);
})().catch((error) => {
    console.error(red(`\nERROR: ${error.message}`));
    process.exit(1);
});
