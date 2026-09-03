/**
 * Adding a friend from the game you just played. The rule: account ids never
 * leave the server. The client names a co-player by SOCKET id and the account
 * is resolved here, after both sockets are shown to be in the room. Account
 * ids in the roster would hand every player a permanent handle for everybody else.
 */

const mockSockets = new Map();
jest.mock('../utils/initializeClient', () => ({
    io: { sockets: { sockets: mockSockets }, to: jest.fn(() => ({ emit: jest.fn() })) },
    server: {},
}));

const mockQuery = jest.fn();
jest.mock('../utils/initializePgClient', () => ({
    pgPool: {},
    isDbEnabled: () => true,
    query: (...args) => mockQuery(...args),
}));

const mockGetState = jest.fn();
const mockGetPlayers = jest.fn();
jest.mock('../data/roomRepo', () => ({
    getState: (...a) => mockGetState(...a),
    getPlayers: (...a) => mockGetPlayers(...a),
}));

const mockRequestFriend = jest.fn();
const mockFindEdges = jest.fn();
jest.mock('../data/friendsRepo', () => ({
    STATUS: { pending: 'pending', accepted: 'accepted', blocked: 'blocked' },
    findEdges: (...a) => mockFindEdges(...a),
    requestFriend: (...a) => mockRequestFriend(...a),
}));

const { roomFriends, addRoomFriend } = require('../controllers/roomFriendController');
const { SERVER_EVENTS } = require('../../shared/events');

const ROOM = 'room-1';
const TOKEN = 7;
const ME_ACCOUNT = { id: 'uuid-me', displayName: 'Me', avatar: 'fox' };
const THEM_ACCOUNT = { id: 'uuid-them', displayName: 'Them', avatar: 'frog' };

const socketFor = (id, account) => {
    const socket = { id, data: account ? { user: account } : {}, emit: jest.fn() };
    mockSockets.set(id, socket);
    return socket;
};

/** The room holds these socket ids. */
const roomHolds = (...ids) => {
    mockGetState.mockResolvedValue({ mode: 'co-op', players: JSON.stringify(ids) });
    mockGetPlayers.mockResolvedValue(ids);
};

const listSentTo = (socket) =>
    socket.emit.mock.calls
        .filter(([event]) => event === SERVER_EVENTS.ROOM_FRIENDS_UPDATE)
        .map(([, payload]) => payload)
        .pop();

beforeEach(() => {
    mockSockets.clear();
    mockQuery.mockReset();
    mockGetState.mockReset();
    mockGetPlayers.mockReset();
    mockFindEdges.mockReset().mockResolvedValue(new Map());
    mockRequestFriend.mockReset().mockResolvedValue('requested');
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('the list', () => {
    test('offers a signed-in co-player, by socket id and never by account id', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-me', 'sock-them');

        await roomFriends(me, { room: ROOM, token: TOKEN });

        const payload = listSentTo(me);
        expect(payload.players).toEqual([
            { id: 'sock-them', name: 'Them', avatar: 'frog', status: 'none' },
        ]);
        // The one assertion this whole design exists for.
        expect(JSON.stringify(payload)).not.toContain(THEM_ACCOUNT.id);
    });

    /*
     * The list is emitted when its Redis/Postgres work finishes, not when
     * asked for, so one for a room already left can arrive late. The room
     * travels with it so the client can tell.
     */
    test('says which room it is about', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-me', 'sock-them');

        await roomFriends(me, { room: ROOM, token: TOKEN });

        expect(listSentTo(me).room).toBe(ROOM);
        expect(listSentTo(me).token).toBe(TOKEN);
    });

    test('and says so on the re-send after an add too', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-me', 'sock-them');

        await addRoomFriend(me, { room: ROOM, playerId: 'sock-them', token: TOKEN });

        expect(listSentTo(me).room).toBe(ROOM);
        expect(listSentTo(me).token).toBe(TOKEN);
    });

    test('leaves out guests — there is no account to befriend', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-guest', null);
        roomHolds('sock-me', 'sock-guest');

        await roomFriends(me, { room: ROOM, token: TOKEN });

        expect(listSentTo(me).players).toEqual([]);
    });

    /*
     * The account is resolved from the LIVE socket, so somebody who closed
     * their tab is not offered — better than a dead button.
     */
    test('leaves out anybody who has already gone', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        roomHolds('sock-me', 'sock-departed');

        await roomFriends(me, { room: ROOM, token: TOKEN });

        expect(listSentTo(me).players).toEqual([]);
    });

    test('leaves out yourself, including a second tab on the same account', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-my-other-tab', ME_ACCOUNT);
        roomHolds('sock-me', 'sock-my-other-tab');

        await roomFriends(me, { room: ROOM, token: TOKEN });

        expect(listSentTo(me).players).toEqual([]);
    });

    test.each([
        ['none', null],
        ['friends', { status: 'accepted', direction: 'outgoing' }],
        ['requested', { status: 'pending', direction: 'outgoing' }],
        ['incoming', { status: 'pending', direction: 'incoming' }],
    ])('reports %s', async (expected, edge) => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-me', 'sock-them');
        mockFindEdges.mockResolvedValue(edge ? new Map([[THEM_ACCOUNT.id, edge]]) : new Map());

        await roomFriends(me, { room: ROOM, token: TOKEN });

        expect(listSentTo(me).players[0].status).toBe(expected);
    });

    /* A block is invisible everywhere else; a silently failing "Add friend" would leak it. */
    test.each([['outgoing'], ['incoming']])('omits a %s block entirely', async (direction) => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-me', 'sock-them');
        mockFindEdges.mockResolvedValue(new Map([[THEM_ACCOUNT.id, { status: 'blocked', direction }]]));

        await roomFriends(me, { room: ROOM, token: TOKEN });

        expect(listSentTo(me).players).toEqual([]);
    });

    test('tells a guest nothing at all', async () => {
        const guest = socketFor('sock-guest', null);
        roomHolds('sock-guest', 'sock-them');

        await roomFriends(guest, { room: ROOM, token: TOKEN });

        expect(guest.emit).not.toHaveBeenCalled();
    });

    test('refuses a room the asker is not in', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        roomHolds('sock-somebody-else');

        await roomFriends(me, { room: ROOM, token: TOKEN });

        expect(me.emit).not.toHaveBeenCalled();
    });
});

describe('adding', () => {
    test('sends the request and answers with the refreshed list', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-me', 'sock-them');

        await addRoomFriend(me, { room: ROOM, playerId: 'sock-them', token: TOKEN });

        expect(mockRequestFriend).toHaveBeenCalledWith(ME_ACCOUNT.id, THEM_ACCOUNT.id);
        expect(listSentTo(me)).toBeDefined();
    });

    /*
     * Without the second membership check this adds ANY account whose socket
     * id you can name — and socket ids are on the wire in every hover.
     */
    test('refuses a socket that is not in the room', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-stranger', THEM_ACCOUNT);
        roomHolds('sock-me');

        await addRoomFriend(me, { room: ROOM, playerId: 'sock-stranger', token: TOKEN });

        expect(mockRequestFriend).not.toHaveBeenCalled();
    });

    test('refuses when the asker is not in the room', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-them');

        await addRoomFriend(me, { room: ROOM, playerId: 'sock-them', token: TOKEN });

        expect(mockRequestFriend).not.toHaveBeenCalled();
    });

    test.each([
        ['a guest asker', null, { room: ROOM, playerId: 'sock-them', token: TOKEN }],
        ['yourself', ME_ACCOUNT, { room: ROOM, playerId: 'sock-me', token: TOKEN }],
        ['a malformed room', ME_ACCOUNT, { room: '', playerId: 'sock-them', token: TOKEN }],
        ['a missing player id', ME_ACCOUNT, { room: ROOM, token: TOKEN }],
        ['a missing token', ME_ACCOUNT, { room: ROOM, playerId: 'sock-them' }],
        ['a junk token', ME_ACCOUNT, { room: ROOM, playerId: 'sock-them', token: 'soon' }],
    ])('refuses %s', async (_label, account, payload) => {
        const me = socketFor('sock-me', account);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-me', 'sock-them');

        await addRoomFriend(me, payload);

        expect(mockRequestFriend).not.toHaveBeenCalled();
    });

    test('a repo failure does not throw at the socket', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-me', 'sock-them');
        mockRequestFriend.mockRejectedValue(new Error('connection terminated'));

        await expect(addRoomFriend(me, { room: ROOM, playerId: 'sock-them', token: TOKEN })).resolves.toBeUndefined();
    });
});

describe('the cost of the list', () => {
    /*
     * The regression: one edge query per player, in rooms with no size limit,
     * asked for by every signed-in player at once.
     */
    test('asks about the whole room in one query', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        const ids = Array.from({ length: 12 }, (_, i) => `sock-${i}`);
        ids.forEach((id, i) => socketFor(id, { id: `uuid-${i}`, displayName: `P${i}`, avatar: null }));
        roomHolds('sock-me', ...ids);

        await roomFriends(me, { room: ROOM, token: TOKEN });

        expect(mockFindEdges).toHaveBeenCalledTimes(1);
        expect(mockFindEdges.mock.calls[0][1]).toHaveLength(12);
        expect(listSentTo(me).players).toHaveLength(12);
    });
});
