/**
 * Adding a friend from the game you just played.
 *
 * The rule this file is really about: **account ids never leave the server.**
 * The client addresses a co-player by SOCKET id — something it already sees on
 * every hover and reaction — and the account is resolved here, only after both
 * sockets are shown to be in the room. Putting account ids in the roster
 * instead would hand every player in a room a permanent handle for everybody
 * else, which is exactly what the code-only rule exists to prevent.
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

        await roomFriends(me, { room: ROOM });

        const payload = listSentTo(me);
        expect(payload.players).toEqual([
            { id: 'sock-them', name: 'Them', avatar: 'frog', status: 'none' },
        ]);
        // The one assertion this whole design exists for.
        expect(JSON.stringify(payload)).not.toContain(THEM_ACCOUNT.id);
    });

    test('leaves out guests — there is no account to befriend', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-guest', null);
        roomHolds('sock-me', 'sock-guest');

        await roomFriends(me, { room: ROOM });

        expect(listSentTo(me).players).toEqual([]);
    });

    /*
     * The account is resolved from the LIVE socket, so somebody who closed
     * their tab the moment the race ended is simply not offered — honest,
     * rather than a button that silently does nothing.
     */
    test('leaves out anybody who has already gone', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        roomHolds('sock-me', 'sock-departed');

        await roomFriends(me, { room: ROOM });

        expect(listSentTo(me).players).toEqual([]);
    });

    test('leaves out yourself, including a second tab on the same account', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-my-other-tab', ME_ACCOUNT);
        roomHolds('sock-me', 'sock-my-other-tab');

        await roomFriends(me, { room: ROOM });

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

        await roomFriends(me, { room: ROOM });

        expect(listSentTo(me).players[0].status).toBe(expected);
    });

    /*
     * A block is invisible everywhere else in this feature; an "Add friend"
     * button that silently failed would be the one place it leaked.
     */
    test.each([['outgoing'], ['incoming']])('omits a %s block entirely', async (direction) => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-me', 'sock-them');
        mockFindEdges.mockResolvedValue(new Map([[THEM_ACCOUNT.id, { status: 'blocked', direction }]]));

        await roomFriends(me, { room: ROOM });

        expect(listSentTo(me).players).toEqual([]);
    });

    test('tells a guest nothing at all', async () => {
        const guest = socketFor('sock-guest', null);
        roomHolds('sock-guest', 'sock-them');

        await roomFriends(guest, { room: ROOM });

        expect(guest.emit).not.toHaveBeenCalled();
    });

    test('refuses a room the asker is not in', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        roomHolds('sock-somebody-else');

        await roomFriends(me, { room: ROOM });

        expect(me.emit).not.toHaveBeenCalled();
    });
});

describe('adding', () => {
    test('sends the request and answers with the refreshed list', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-me', 'sock-them');

        await addRoomFriend(me, { room: ROOM, playerId: 'sock-them' });

        expect(mockRequestFriend).toHaveBeenCalledWith(ME_ACCOUNT.id, THEM_ACCOUNT.id);
        expect(listSentTo(me)).toBeDefined();
    });

    /*
     * Without the second membership check this is a way to add ANY account
     * whose socket id you can name — and socket ids are on the wire in every
     * hover, reaction and ping.
     */
    test('refuses a socket that is not in the room', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-stranger', THEM_ACCOUNT);
        roomHolds('sock-me');

        await addRoomFriend(me, { room: ROOM, playerId: 'sock-stranger' });

        expect(mockRequestFriend).not.toHaveBeenCalled();
    });

    test('refuses when the asker is not in the room', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        socketFor('sock-them', THEM_ACCOUNT);
        roomHolds('sock-them');

        await addRoomFriend(me, { room: ROOM, playerId: 'sock-them' });

        expect(mockRequestFriend).not.toHaveBeenCalled();
    });

    test.each([
        ['a guest asker', null, { room: ROOM, playerId: 'sock-them' }],
        ['yourself', ME_ACCOUNT, { room: ROOM, playerId: 'sock-me' }],
        ['a malformed room', ME_ACCOUNT, { room: '', playerId: 'sock-them' }],
        ['a missing player id', ME_ACCOUNT, { room: ROOM }],
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

        await expect(addRoomFriend(me, { room: ROOM, playerId: 'sock-them' })).resolves.toBeUndefined();
    });
});

describe('the cost of the list', () => {
    /*
     * The regression this exists for: one edge query per player. Co-op rooms
     * have no size limit, so that was a query per player every time a game
     * ended — and the offer is asked for by every signed-in player in the room
     * at once.
     */
    test('asks about the whole room in one query', async () => {
        const me = socketFor('sock-me', ME_ACCOUNT);
        const ids = Array.from({ length: 12 }, (_, i) => `sock-${i}`);
        ids.forEach((id, i) => socketFor(id, { id: `uuid-${i}`, displayName: `P${i}`, avatar: null }));
        roomHolds('sock-me', ...ids);

        await roomFriends(me, { room: ROOM });

        expect(mockFindEdges).toHaveBeenCalledTimes(1);
        expect(mockFindEdges.mock.calls[0][1]).toHaveLength(12);
        expect(listSentTo(me).players).toHaveLength(12);
    });
});
