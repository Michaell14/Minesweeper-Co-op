/**
 * Presence: who your friends can see, and the two ways it would be wrong.
 *
 * A player with two tabs must not flicker offline when they close one, and a
 * guest must cost nothing at all — presence runs on EVERY connect and
 * disconnect, so a query per anonymous socket would be a query per visitor.
 *
 * The scan is deliberately not a `user:<id>` socket room. Room codes here are
 * arbitrary player-typed strings, so that room shares a namespace with the join
 * box: anyone who knew an account id could create it and receive their traffic.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
const mockSockets = new Map();

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo, sockets: { sockets: mockSockets } },
    server: {},
}));

const mockQuery = jest.fn();
jest.mock('../utils/initializePgClient', () => ({
    pgPool: {},
    isDbEnabled: () => true,
    query: (...args) => mockQuery(...args),
}));

const presence = require('../utils/presence');
const { SERVER_EVENTS } = require('../../shared/events');

const ALICE = 'uuid-alice';
const BOB = 'uuid-bob';

/** Puts a socket in the live map, signed in or not. */
const connect = (id, userId) => {
    const socket = { id, data: userId ? { user: { id: userId } } : {}, emit: jest.fn() };
    mockSockets.set(id, socket);
    return socket;
};

/** friendsRepo.listFriendIds resolves to these. */
const friendsAre = (...ids) =>
    mockQuery.mockResolvedValue({ rows: ids.map((id) => ({ friend_id: id })) });

const presenceEvents = () =>
    mockEmit.mock.calls.filter(([event]) => event === SERVER_EVENTS.FRIEND_PRESENCE).map(([, p]) => p);

beforeEach(() => {
    mockSockets.clear();
    mockEmit.mockReset();
    mockTo.mockReset().mockReturnValue({ emit: mockEmit });
    mockQuery.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('the scan', () => {
    test('finds every socket an account has, and nobody else\'s', () => {
        connect('s1', ALICE);
        connect('s2', BOB);
        connect('s3', ALICE);
        connect('s4', null);   // a guest

        expect(presence.socketIdsOf(ALICE).sort()).toEqual(['s1', 's3']);
        expect(presence.isOnline(BOB)).toBe(true);
        expect(presence.isOnline('uuid-nobody')).toBe(false);
    });
});

describe('a second tab', () => {
    /*
     * The failure this exists to stop: a player with the game open twice
     * closes one tab, and their friends watch them wink out while they are
     * still playing.
     */
    test('closing one of two does not announce a departure', async () => {
        const first = connect('s1', ALICE);
        connect('s2', ALICE);
        friendsAre(BOB);

        mockSockets.delete('s2');           // the tab closes; s1 is still live
        await presence.onDisconnect({ ...first, id: 's2', data: { user: { id: ALICE } } });

        expect(presenceEvents()).toEqual([]);
    });

    test('and opening one does not announce an arrival', async () => {
        connect('s1', ALICE);
        const second = connect('s2', ALICE);
        friendsAre(BOB);
        connect('sb', BOB);

        await presence.onConnect(second);

        expect(presenceEvents()).toEqual([]);
    });

    test('but the LAST socket going does announce it', async () => {
        const only = connect('s1', ALICE);
        connect('sb', BOB);
        friendsAre(BOB);
        mockSockets.delete('s1');

        await presence.onDisconnect(only);

        expect(presenceEvents()).toEqual([{ id: ALICE, online: false }]);
    });

    /*
     * A reload is a disconnect and a connect a moment apart, and the friend
     * lookup in between is a Postgres round trip. The departure must not
     * outlive the arrival that overtook it.
     */
    test('and a reconnect inside the lookup cancels the departure', async () => {
        const first = connect('s1', ALICE);
        connect('sb', BOB);
        friendsAre(BOB);
        mockSockets.delete('s1');

        // The reload lands while listFriendIds is still in flight.
        mockQuery.mockImplementationOnce(async () => {
            connect('s2', ALICE);
            return { rows: [{ friend_id: BOB }] };
        });
        await presence.onDisconnect(first);

        expect(presenceEvents()).toEqual([]);
    });
});

describe('arriving', () => {
    test('is told which friends are already here', async () => {
        const alice = connect('s1', ALICE);
        connect('sb', BOB);
        friendsAre(BOB, 'uuid-offline');

        await presence.onConnect(alice);

        expect(alice.emit).toHaveBeenCalledWith(SERVER_EVENTS.FRIENDS_ONLINE, { ids: [BOB] });
    });

    test('and its online friends are told about it', async () => {
        const alice = connect('s1', ALICE);
        connect('sb', BOB);
        friendsAre(BOB);

        await presence.onConnect(alice);

        expect(presenceEvents()).toEqual([{ id: ALICE, online: true }]);
        expect(mockTo).toHaveBeenCalledWith('sb');
    });

    // An offline friend has no socket to receive it and gets a snapshot of
    // their own when they arrive.
    test('offline friends are not written to', async () => {
        const alice = connect('s1', ALICE);
        friendsAre('uuid-offline');

        await presence.onConnect(alice);

        expect(presenceEvents()).toEqual([]);
    });
});

describe('guests', () => {
    // Presence runs on every connect, so a query per anonymous socket would be
    // a query per visitor.
    test('cost no query at all', async () => {
        const guest = connect('s1', null);

        await presence.onConnect(guest);
        await presence.onDisconnect(guest);

        expect(mockQuery).not.toHaveBeenCalled();
        expect(guest.emit).not.toHaveBeenCalled();
    });
});

describe('a database outage', () => {
    /*
     * The contract: presence is cosmetic, and nothing about it may refuse a
     * connection. An exception here would propagate into the connection
     * handler and take the socket with it.
     */
    test('does not throw out of connect or disconnect', async () => {
        const alice = connect('s1', ALICE);
        mockQuery.mockRejectedValue(new Error('connection terminated'));

        await expect(presence.onConnect(alice)).resolves.toBeUndefined();
        mockSockets.delete('s1');
        await expect(presence.onDisconnect(alice)).resolves.toBeUndefined();
    });
});
