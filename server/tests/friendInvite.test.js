/**
 * The invite: the one message an account sends to another ACCOUNT rather than
 * a room, so every guard proves it was wanted. Refusals are SILENT for privacy:
 * "not your friend", "blocked you" and "not online" are each a fact about
 * somebody who did not choose to tell the sender.
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

const mockGetState = jest.fn();
jest.mock('../data/roomRepo', () => ({ getState: (...a) => mockGetState(...a) }));

const { inviteFriend, clearInviteCooldowns, INVITE_COOLDOWN_MS } = require('../controllers/friendInviteController');
const { SERVER_EVENTS } = require('../../shared/events');

const ME = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const FRIEND = '9c858901-8a57-4791-81fe-4c455b099bc9';
const ROOM = 'room-1';

const senderSocket = () => ({
    id: 'sock-me',
    data: { user: { id: ME, displayName: 'Alice', avatar: 'fox' } },
});

/** Puts the friend on the site so the online check passes. */
const friendIsOnline = () => mockSockets.set('sock-friend', { id: 'sock-friend', data: { user: { id: FRIEND } } });

const roomHolding = (players, mode = 'co-op') =>
    mockGetState.mockResolvedValue({ mode, players: JSON.stringify(players) });

/** friendsRepo.areFriends resolves truthy/falsy off this. */
const areFriends = (yes) => mockQuery.mockResolvedValue({ rows: yes ? [{ '?column?': 1 }] : [] });

const invitesSent = () =>
    mockEmit.mock.calls.filter(([event]) => event === SERVER_EVENTS.FRIEND_INVITE).map(([, p]) => p);

beforeEach(() => {
    mockSockets.clear();
    mockEmit.mockReset();
    mockTo.mockReset().mockReturnValue({ emit: mockEmit });
    mockQuery.mockReset();
    mockGetState.mockReset();
    clearInviteCooldowns();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('a valid invite', () => {
    test('reaches every socket the friend has', async () => {
        friendIsOnline();
        mockSockets.set('sock-friend-2', { id: 'sock-friend-2', data: { user: { id: FRIEND } } });
        areFriends(true);
        roomHolding(['sock-me']);

        await inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM });

        // One emit per socket, not per account: two tabs both see the invite.
        const payload = { fromId: ME, fromName: 'Alice', fromAvatar: 'fox', room: ROOM, mode: 'co-op' };
        expect(invitesSent()).toEqual([payload, payload]);
        expect(mockTo.mock.calls.map(([id]) => id).sort()).toEqual(['sock-friend', 'sock-friend-2']);
    });
});

describe('what it refuses, silently', () => {
    test('somebody who is not a friend', async () => {
        friendIsOnline();
        areFriends(false);
        roomHolding(['sock-me']);

        await inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM });

        expect(invitesSent()).toEqual([]);
    });

    /* A block removes the friendship row; this says blocking is what stops invites. */
    test('somebody who blocked the sender', async () => {
        friendIsOnline();
        areFriends(false);   // the block deleted the accepted row
        roomHolding(['sock-me']);

        await inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM });

        expect(invitesSent()).toEqual([]);
    });

    test('a friend who is not online', async () => {
        areFriends(true);
        roomHolding(['sock-me']);

        await inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM });

        expect(invitesSent()).toEqual([]);
        // Offline is checked before the graph: cheapest, and the commonest.
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('a room that does not exist', async () => {
        friendIsOnline();
        areFriends(true);
        mockGetState.mockResolvedValue(null);

        await inviteFriend(senderSocket(), { friendId: FRIEND, room: 'no-such-room' });

        expect(invitesSent()).toEqual([]);
    });

    /* Otherwise an account could send a friend into ANY room code it can name. */
    test('a room the SENDER is not in', async () => {
        friendIsOnline();
        areFriends(true);
        roomHolding(['sock-somebody-else']);

        await inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM });

        expect(invitesSent()).toEqual([]);
    });

    // PVP is a duel. Co-op has no size limit, so only a race can be full.
    test('a race that already has two players', async () => {
        friendIsOnline();
        areFriends(true);
        roomHolding(['sock-me', 'sock-other'], 'pvp');

        await inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM });

        expect(invitesSent()).toEqual([]);
    });

    test('but a race with one seat left is fine', async () => {
        friendIsOnline();
        areFriends(true);
        roomHolding(['sock-me'], 'pvp');

        await inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM });

        expect(invitesSent()).toHaveLength(1);
    });

    test('a co-op room with several players', async () => {
        friendIsOnline();
        areFriends(true);
        roomHolding(['sock-me', 'a', 'b', 'c']);

        await inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM });

        expect(invitesSent()).toHaveLength(1);
    });

    test.each([
        ['a non-uuid friend id', { friendId: 'not-a-uuid', room: ROOM }],
        ['a missing room', { friendId: FRIEND }],
        ['yourself', { friendId: ME, room: ROOM }],
    ])('%s, before touching anything', async (_label, payload) => {
        friendIsOnline();

        await inviteFriend(senderSocket(), payload);

        expect(invitesSent()).toEqual([]);
        expect(mockGetState).not.toHaveBeenCalled();
    });

    test('a guest sender', async () => {
        friendIsOnline();

        await inviteFriend({ id: 'sock-guest', data: {} }, { friendId: FRIEND, room: ROOM });

        expect(invitesSent()).toEqual([]);
    });
});

describe('the cooldown', () => {
    const sendOne = async () => {
        friendIsOnline();
        areFriends(true);
        roomHolding(['sock-me']);
        await inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM });
    };

    test('one invite per pair per minute', async () => {
        await sendOne();
        await sendOne();

        expect(invitesSent()).toHaveLength(1);
    });

    test('and the second lands once it has passed', async () => {
        await sendOne();
        const realNow = Date.now;
        Date.now = () => realNow() + INVITE_COOLDOWN_MS + 1;
        try {
            await sendOne();
        } finally {
            Date.now = realNow;
        }

        expect(invitesSent()).toHaveLength(2);
    });

    /*
     * The check and the mark sat either side of two awaits, so a double-click
     * sent two invites. The slot is taken before the lookups now.
     */
    test('holds when two invites for the same pair overlap', async () => {
        friendIsOnline();
        areFriends(true);
        roomHolding(['sock-me']);

        await Promise.all([
            inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM }),
            inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM }),
        ]);

        expect(invitesSent()).toHaveLength(1);
    });

    /* The slot is taken up front, so a refusal has to give it back. */
    test('is not spent by an invite that was refused', async () => {
        friendIsOnline();
        areFriends(true);
        roomHolding(['sock-somebody-else']);          // sender is not in it
        await inviteFriend(senderSocket(), { friendId: FRIEND, room: ROOM });
        expect(invitesSent()).toHaveLength(0);

        await sendOne();

        expect(invitesSent()).toHaveLength(1);
    });

    /* Per PAIR, not per sender: the thing protected is one person's attention. */
    test('does not stop the same sender inviting somebody else', async () => {
        const other = '11111111-2222-3333-4444-555555555555';
        mockSockets.set('sock-other-friend', { id: 'sock-other-friend', data: { user: { id: other } } });
        await sendOne();

        areFriends(true);
        roomHolding(['sock-me']);
        await inviteFriend(senderSocket(), { friendId: other, room: ROOM });

        expect(invitesSent()).toHaveLength(2);
    });
});
