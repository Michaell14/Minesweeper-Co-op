/**
 * Restoring a racer who reloaded mid-game.
 *
 * PVP keeps almost everything per player: the board, the progress, the win/loss
 * flags. The room addresses that slot BY SOCKET ID, and a reload changes the
 * socket — so without repointing the slot the room is still talking to a socket
 * that no longer exists, and the returning player has no board of their own.
 *
 * The failure is quiet in the worst way. `playerIndexOf` refuses to act for a
 * socket it cannot place, so a restored-but-unrepointed racer sees a board they
 * cannot click and no error anywhere.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const { addPlayerToRoom } = require('../utils/playerUtils');
const { redisClient } = require('../utils/initializeRedisClient');

const ROOM = 'r1';
const OLD_SOCKET = 'sock-old';
const NEW_SOCKET = 'sock-new';
const RIVAL = 'sock-rival';
const SESSION = 'sess-1';
let client;

/** A 2x2 with one mine, a couple of cells already open. */
const board = () => {
    const b = Array.from({ length: 2 }, () =>
        Array.from({ length: 2 }, () => ({ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }))
    );
    b[0][0] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    return b;
};

/** A race in progress, with this browser holding slot 1 (index 0). */
const racingRoom = (extra = {}) => ({
    mode: 'pvp',
    pvpStarted: 'true',
    startedAt: '1000',
    gameOver: 'false',
    gameWon: 'false',
    winnerSocket: '',
    numRows: '2',
    numCols: '2',
    numMines: '1',
    totalSafeCells: '3',
    player1Socket: OLD_SOCKET,
    player2Socket: RIVAL,
    player1Board: JSON.stringify(board()),
    player2Board: JSON.stringify(board()),
    player1Progress: '2',
    player2Progress: '1',
    player1GameOver: 'false',
    player1GameWon: 'false',
    player2GameOver: 'false',
    player2GameWon: 'false',
    players: JSON.stringify([OLD_SOCKET, RIVAL]),
    ...extra,
});

/** Fields written to the room hash, merged across every hSet. */
const roomWrites = () =>
    client.hSet.mock.calls
        .filter((c) => c[0] === `room:${ROOM}`)
        .reduce((acc, [, fields]) => Object.assign(acc, fields || {}), {});

/** Fields written to a given player's hash, merged. */
const playerWrites = (socketId) =>
    client.hSet.mock.calls
        .filter((c) => c[0] === `player:${socketId}`)
        .reduce((acc, [, fields]) => Object.assign(acc, fields || {}), {});

const emitted = (event) =>
    mockEmit.mock.calls.filter(([name]) => name === event).map(([, payload]) => payload);

const arrange = (roomOverrides = {}) => {
    client.hGetAll.mockImplementation(async (key) => {
        if (key.startsWith('room:')) return racingRoom(roomOverrides);
        // The old player record is deliberately absent. `removePlayer` deletes it
        // the moment the socket drops, so it is already gone by the time the
        // browser is back — restoring from it looked like it worked against a
        // fixture that kept it around, and did nothing at all in a real reload.
        if (key === `player:${OLD_SOCKET}`) return {};
        if (key === `player:${RIVAL}`) return { name: 'Rival', score: '3', pvpPlayerIndex: '1' };
        return {};
    });
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'socketId') return OLD_SOCKET;
        if (key === `player:${RIVAL}` && field === 'name') return 'Rival';
        if (field === 'name') return 'Racer';
        return null;
    });
};

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hSet.mockResolvedValue(1);
    client.expire.mockResolvedValue(1);
    client.del.mockResolvedValue(1);
    client.exists.mockResolvedValue(0);
    arrange();
});

describe('a racer returning on a new socket', () => {
    test('the room slot is repointed, so it stops addressing a dead socket', async () => {
        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Racer', SESSION);

        expect(roomWrites().player1Socket).toBe(NEW_SOCKET);
    });

    /*
     * The index is rebuilt from the room's slot, not copied from the old player
     * record, which no longer exists. Without it pvp.js refuses to act for a
     * socket it cannot place: the board comes back and then silently ignores
     * every click, with one line in the server log and nothing on screen.
     */
    test('their PVP index is rebuilt from the room, so the board is playable', async () => {
        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Racer', SESSION);

        expect(playerWrites(NEW_SOCKET).pvpPlayerIndex).toBe('0');
    });

    test('the opponent is named from the room too', async () => {
        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Racer', SESSION);

        expect(playerWrites(NEW_SOCKET).opponentName).toBe('Rival');
    });

    test('they are told the game is under way, not sat in the lobby', async () => {
        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Racer', SESSION);

        expect(emitted('pvpGameStarted')).toHaveLength(1);
    });

    test('they get their OWN board back, with the opponent named', async () => {
        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Racer', SESSION);

        const [payload] = emitted('pvpBoardUpdate');
        expect(payload.playerIndex).toBe(0);
        expect(payload.opponentName).toBe('Rival');
        expect(payload.opponentProgress).toBe(1);
    });

    /* Mid-race their own mines are still a secret; a leaked layout wins the game. */
    test('an unfinished board comes back with its mines still hidden', async () => {
        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Racer', SESSION);

        const [payload] = emitted('pvpBoardUpdate');
        const closedMine = payload.board[0][0];
        expect(closedMine.isOpen).toBe(false);
        expect(closedMine.isMine).toBe(false);
    });

    test('a board they already lost on comes back revealed', async () => {
        arrange({ player1GameOver: 'true' });

        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Racer', SESSION);

        const [payload] = emitted('pvpBoardUpdate');
        expect(payload.board[0][0].isMine).toBe(true);
        expect(emitted('pvpGameOver')).toHaveLength(1);
    });

    test('a race decided while they were away is replayed to them', async () => {
        arrange({ winnerSocket: RIVAL });

        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Racer', SESSION);

        const [payload] = emitted('pvpPlayerWon');
        expect(payload.winnerSocket).toBe(RIVAL);
    });

    /* The lobby's blank grid would wipe the board they were mid-way through. */
    test('the empty lobby board is NOT sent over the top of the restored one', async () => {
        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Racer', SESSION);

        expect(emitted('boardUpdate')).toHaveLength(0);
    });
});

describe('a player joining a PVP room with no race of their own', () => {
    test('still gets the lobby board, as before', async () => {
        client.hGet.mockImplementation(async () => null); // no previous session

        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Newcomer', SESSION);

        expect(emitted('boardUpdate')).toHaveLength(1);
        expect(emitted('pvpGameStarted')).toHaveLength(0);
    });

    test('a race that never started is left to the lobby path', async () => {
        arrange({ pvpStarted: 'false' });

        await addPlayerToRoom(ROOM, NEW_SOCKET, 'Racer', SESSION);

        expect(emitted('boardUpdate')).toHaveLength(1);
        expect(emitted('pvpGameStarted')).toHaveLength(0);
    });
});
