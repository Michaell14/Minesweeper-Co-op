/**
 * Presence: who your friends can see. A player with two tabs must not flicker
 * offline when they close one, and a guest must cost no query, since presence
 * runs on EVERY connect and disconnect. The scan is not a `user:<id>` socket
 * room: room codes are player-typed strings in that namespace, so anyone
 * knowing an account id could create it and receive their traffic.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
const mockSockets = new Map();

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo, get sockets() { return { sockets: global.__presenceSockets }; } },
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

/** How many times the live socket map was walked; a plain iterable counts real traversals. */
let walks = 0;
const countingSockets = {
    [Symbol.iterator]() {
        walks += 1;
        return mockSockets[Symbol.iterator]();
    },
};

const presenceEvents = () =>
    mockEmit.mock.calls.filter(([event]) => event === SERVER_EVENTS.FRIEND_PRESENCE).map(([, p]) => p);

beforeEach(() => {
    walks = 0;
    global.__presenceSockets = countingSockets;
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
     * A player with the game open twice closes one tab; their friends must not
     * watch them wink out while they are still playing.
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
     * A reload is a disconnect and a connect a moment apart, with a Postgres
     * round trip between. The departure must not outlive the arrival.
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

    /*
     * Same race, but a RECOVERED reconnect comes back under the departing
     * socket's id; excluding the leaver by id would announce a player who never left.
     */
    test('and a recovered reconnect reusing the same id cancels it too', async () => {
        const first = connect('s1', ALICE);
        connect('sb', BOB);
        friendsAre(BOB);
        mockSockets.delete('s1');

        mockQuery.mockImplementationOnce(async () => {
            connect('s1', ALICE);   // recovered: same id, new instance
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

    // An offline friend has no socket to receive it; they get a snapshot on arrival.
    test('offline friends are not written to', async () => {
        const alice = connect('s1', ALICE);
        friendsAre('uuid-offline');

        await presence.onConnect(alice);

        expect(presenceEvents()).toEqual([]);
    });
});

describe('guests', () => {
    // Presence runs on every connect, so a query per guest is a query per visitor.
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
     * Presence is cosmetic: an exception here would propagate into the
     * connection handler and take the socket with it.
     */
    test('does not throw out of connect or disconnect', async () => {
        const alice = connect('s1', ALICE);
        mockQuery.mockRejectedValue(new Error('connection terminated'));

        await expect(presence.onConnect(alice)).resolves.toBeUndefined();
        mockSockets.delete('s1');
        await expect(presence.onDisconnect(alice)).resolves.toBeUndefined();
    });

    /*
     * Sending nothing LOOKS safe, but a reconnecting client keeps whatever it
     * last held and this snapshot is the only thing that corrects it: friends
     * who left during the outage would stay lit, with an invite button that
     * does nothing. Empty is what the contract promises for an outage.
     */
    test('still sends a snapshot, and it is empty', async () => {
        const alice = connect('s1', ALICE);
        mockQuery.mockRejectedValue(new Error('connection terminated'));

        await presence.onConnect(alice);

        expect(alice.emit).toHaveBeenCalledWith(SERVER_EVENTS.FRIENDS_ONLINE, { ids: [] });
    });
});

describe('the cost of a connect', () => {
    /*
     * `isOnline` and `emitToUser` used to walk the whole socket map once per
     * friend, O(friends x sockets) on the connection path; they read one index
     * now. The bound is loose so this stays something to believe rather than
     * something to update.
     */
    test('does not grow with the size of the friend list', async () => {
        const alice = connect('s1', ALICE);
        const friendIds = Array.from({ length: 50 }, (_, i) => `uuid-friend-${i}`);
        friendIds.forEach((id, i) => connect(`sock-${i}`, id));
        friendsAre(...friendIds);

        walks = 0;
        await presence.onConnect(alice);

        expect(presenceEvents()).toHaveLength(50);   // everybody was told
        expect(walks).toBeLessThanOrEqual(4);        // ...from a handful of passes
    });
});
