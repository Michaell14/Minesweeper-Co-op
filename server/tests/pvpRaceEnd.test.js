/**
 * What a decided race does to the player who did NOT win it.
 *
 * Everything about ending a PVP game is per player, and the loser is the one
 * with nothing of their own to end: they never detonated, so neither of their
 * flags is set and nothing on their side of the room says the game is over.
 * `stopRace` already stops their clock. These cover the two things that did not
 * follow it — their board stayed hidden, and their moves kept working.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const pvp = require('../game/pvp');
const { redisClient } = require('../utils/initializeRedisClient');

const ROOM = 'r1';
const WINNER = 'sock-winner';
const LOSER = 'sock-loser';

let client;

/*
 * 2x2 with one mine at (0,0). Every cell claims one adjacent mine so nothing
 * cascades and each move opens exactly the cell it names.
 */
const boardWith = (closed) => {
    const board = Array.from({ length: 2 }, () =>
        Array.from({ length: 2 }, () => ({ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }))
    );
    board[0][0] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    for (const [r, c] of closed) board[r][c] = { ...board[r][c], isOpen: false };
    return board;
};

/** The winner one move short — opening (1,1) completes it. */
const oneMoveFromWinning = () => boardWith([[1, 1]]);

/** The loser mid-race, with (1,0) and (1,1) still to go. */
const halfPlayedBoard = () => boardWith([[1, 0], [1, 1]]);

const racingRoom = (extra = {}) => ({
    mode: 'pvp',
    pvpStarted: 'true',
    startedAt: '1000',
    winnerSocket: '',
    numRows: '2',
    numCols: '2',
    numMines: '1',
    totalSafeCells: '3',
    players: JSON.stringify([WINNER, LOSER]),
    player1Socket: WINNER,
    player2Socket: LOSER,
    player1Board: JSON.stringify(oneMoveFromWinning()),
    player2Board: JSON.stringify(halfPlayedBoard()),
    player1Initialized: 'true',
    player2Initialized: 'true',
    player1GameOver: 'false',
    player2GameOver: 'false',
    player1GameWon: 'false',
    player2GameWon: 'false',
    player1Progress: '3',
    player2Progress: '2',
    ...extra,
});

/** Payloads of `event` sent to one socket. */
const sentTo = (socketId, event) => {
    const targets = mockTo.mock.calls.map(([target]) => target);
    return mockEmit.mock.calls
        .map((call, index) => ({ target: targets[index], call }))
        .filter(({ target, call }) => target === socketId && call[0] === event)
        .map(({ call }) => call[1]);
};

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hSet.mockResolvedValue(1);
    client.set.mockResolvedValue('OK');
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:') ? racingRoom() : { name: 'Winner', score: '0', pvpPlayerIndex: '0' }
    );
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'name') return key.includes(WINNER) ? 'Winner' : 'Loser';
        if (field === 'players') return JSON.stringify([WINNER, LOSER]);
        if (field === 'startedAt') return '1000';
        if (field === 'totalSafeCells') return '3';
        return null;
    });
});

/** Plays the winner's last cell, which completes their board. */
const winTheRace = () =>
    pvp.openCell(1, 1, ROOM, WINNER, racingRoom(), '2', { pvpPlayerIndex: '0', name: 'Winner' });

describe('the board the loser was racing on', () => {
    test('is sent back to them with the mines in it', async () => {
        await winTheRace();

        const [payload] = sentTo(LOSER, 'pvpBoardUpdate');
        expect(payload).toBeDefined();
        expect(payload.board[0][0].isMine).toBe(true);
    });

    test('is THEIR board, not the winner\'s — the two diverged through play', async () => {
        await winTheRace();

        const [payload] = sentTo(LOSER, 'pvpBoardUpdate');
        // (1,0) is open on the winner's board and was never opened on this one.
        expect(payload.board[1][0].isOpen).toBe(false);
        expect(payload.playerIndex).toBe(1);
    });

    test('the winner is not sent the loser\'s board', async () => {
        await winTheRace();

        const toWinner = sentTo(WINNER, 'pvpBoardUpdate');
        expect(toWinner).toHaveLength(0);
    });
});

/*
 * The winner's own flags stop the WINNER. Nothing stopped the other player:
 * both of their flags are still false, so they could carry on opening cells in
 * a race that had already been decided — broadcasting progress into a game
 * nobody was watching, and now doing it with every mine on screen.
 */
describe('moves after the race has been decided', () => {
    const decided = () => racingRoom({ winnerSocket: WINNER });
    const asLoser = { pvpPlayerIndex: '1', name: 'Loser' };

    test('opening a cell does nothing', async () => {
        await pvp.openCell(1, 1, ROOM, LOSER, decided(), '2', asLoser);

        expect(client.hSet).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });

    test('chording does nothing', async () => {
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? decided() : asLoser
        );

        await pvp.chordCell(0, 1, ROOM, LOSER, decided());

        expect(client.hSet).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });

    test('flagging does nothing', async () => {
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? decided() : asLoser
        );

        await pvp.toggleFlag(1, 1, ROOM, LOSER, decided());

        expect(client.hSet).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });

    /*
     * Both finishing at once is the one case that must still get through: the
     * winner lock decides who is first, and the second player's move is already
     * past this gate by then. Their board still has to be marked won.
     */
    test('a move already in flight can still record a simultaneous finish', async () => {
        // The snapshot the move is holding still says the race is open — it was
        // read under the lock, before the other player's win landed. Only the
        // re-read inside checkWin sees the winner.
        const stillOpen = racingRoom({ player2Board: JSON.stringify(oneMoveFromWinning()) });
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? decided() : asLoser
        );

        await pvp.openCell(1, 1, ROOM, LOSER, stillOpen, '2', asLoser);

        const wrote = client.hSet.mock.calls.some(
            ([, fields]) => fields && fields.player2GameWon === 'true'
        );
        expect(wrote).toBe(true);
    });
});
