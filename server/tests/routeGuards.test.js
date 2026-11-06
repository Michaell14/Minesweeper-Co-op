/**
 * The route guards. The difference is the REFUSAL, not the check:
 * `ROOM_MEMBER` answers `roomDoesNotExistError` and leaves the room;
 * `ROOM_MEMBER_SILENT` says nothing, which hover and emotes need so a refusal
 * cannot amplify a flood or evict a legitimate player. These tests keep the two
 * from converging. `ROOM_MEMBER_CACHED` is the silent one reusing an admission.
 */

const mockRoomRepo = { getFields: jest.fn() };
const mockPlayerRepo = { exists: jest.fn() };

jest.mock('../data/roomRepo', () => mockRoomRepo);
jest.mock('../data/playerRepo', () => mockPlayerRepo);

const { GUARDS, MEMBERSHIP_FIELDS, MEMBER_PASS_MS } = require('../routes/guards');
const { SERVER_EVENTS } = require('../../shared/events');

const ROOM = 'ABCD';
const SOCKET = 'socket-1';

/** In ROOM as socket.io sees it, which is what a leave changes. */
const fakeSocket = () => ({ id: SOCKET, emit: jest.fn(), leave: jest.fn(), data: {}, rooms: new Set([SOCKET, ROOM]) });

/** The room exists, the player exists, and the player is in it. */
const everythingPresent = () => {
    mockPlayerRepo.exists.mockResolvedValue(true);
    mockRoomRepo.getFields.mockResolvedValue({ players: JSON.stringify([SOCKET]), mode: 'co-op' });
};

/** How `roomRepo.getFields` answers for a room with no hash: no fields at all. */
const roomGone = () => mockRoomRepo.getFields.mockResolvedValue({});

beforeEach(() => {
    jest.clearAllMocks();
    everythingPresent();
});

describe('GUARDS.NONE', () => {
    test('admits without reading anything', async () => {
        const result = await GUARDS.NONE({ socket: fakeSocket(), payload: {} });

        expect(result.ok).toBe(true);
        expect(mockRoomRepo.getFields).not.toHaveBeenCalled();
    });
});

/**
 * The room hash holds every board in the room, three in PVP. Fetching all of
 * it per hover and per click was most of the server's Redis bandwidth.
 */
describe('what a room guard reads', () => {
    test.each([
        ['ROOM_MEMBER', GUARDS.ROOM_MEMBER],
        ['ROOM_MEMBER_SILENT', GUARDS.ROOM_MEMBER_SILENT],
        ['ROOM_MEMBER_CACHED', GUARDS.ROOM_MEMBER_CACHED],
    ])('%s asks for the membership fields only', async (_label, guard) => {
        await guard({ socket: fakeSocket(), payload: { room: ROOM } });

        expect(mockRoomRepo.getFields).toHaveBeenCalledWith(ROOM, MEMBERSHIP_FIELDS);
    });

    test('never a board', () => {
        expect(MEMBERSHIP_FIELDS.some((field) => /board/i.test(field))).toBe(false);
    });

    test('but everything a handler reads off the state it hands back', () => {
        // routes/social.js: the mode gates hover and ping; the dimensions bound a ping.
        expect(MEMBERSHIP_FIELDS).toEqual(expect.arrayContaining(['players', 'mode', 'numRows', 'numCols']));
    });
});

describe('GUARDS.ROOM_MEMBER', () => {
    test('admits a player who is in the room', async () => {
        const result = await GUARDS.ROOM_MEMBER({ socket: fakeSocket(), payload: { room: ROOM } });

        expect(result.ok).toBe(true);
    });

    test('hands back the room state it already read', async () => {
        const result = await GUARDS.ROOM_MEMBER({ socket: fakeSocket(), payload: { room: ROOM } });

        expect(result.roomState).toEqual(expect.objectContaining({ mode: 'co-op' }));
    });

    test('refuses when the room is gone, and says so', async () => {
        roomGone();
        const socket = fakeSocket();

        const result = await GUARDS.ROOM_MEMBER({ socket, payload: { room: ROOM } });

        expect(result.ok).toBe(false);
        expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ROOM_DOES_NOT_EXIST_ERROR);
    });

    test('drops the socket out of a room it was refused from', async () => {
        roomGone();
        const socket = fakeSocket();

        await GUARDS.ROOM_MEMBER({ socket, payload: { room: ROOM } });

        expect(socket.leave).toHaveBeenCalledWith(ROOM);
    });

    test('refuses when the player record is gone', async () => {
        mockPlayerRepo.exists.mockResolvedValue(false);

        const result = await GUARDS.ROOM_MEMBER({ socket: fakeSocket(), payload: { room: ROOM } });

        expect(result.ok).toBe(false);
    });

    test('refuses a socket that exists but is in a different room', async () => {
        mockRoomRepo.getFields.mockResolvedValue({ players: JSON.stringify(['someone-else']) });

        const result = await GUARDS.ROOM_MEMBER({ socket: fakeSocket(), payload: { room: ROOM } });

        expect(result.ok).toBe(false);
    });
});

describe('GUARDS.ROOM_MEMBER_SILENT', () => {
    test('admits a player who is in the room', async () => {
        const result = await GUARDS.ROOM_MEMBER_SILENT({ socket: fakeSocket(), payload: { room: ROOM } });

        expect(result.ok).toBe(true);
    });

    test('hands back the room state, so a handler can check the mode for free', async () => {
        const result = await GUARDS.ROOM_MEMBER_SILENT({ socket: fakeSocket(), payload: { room: ROOM } });

        expect(result.roomState).toEqual(expect.objectContaining({ mode: 'co-op' }));
    });

    test('refuses the same cases as ROOM_MEMBER', async () => {
        mockRoomRepo.getFields.mockResolvedValue({ players: JSON.stringify(['someone-else']) });

        const result = await GUARDS.ROOM_MEMBER_SILENT({ socket: fakeSocket(), payload: { room: ROOM } });

        expect(result.ok).toBe(false);
    });

    test('says nothing when it refuses', async () => {
        roomGone();
        const socket = fakeSocket();

        await GUARDS.ROOM_MEMBER_SILENT({ socket, payload: { room: ROOM } });

        expect(socket.emit).not.toHaveBeenCalled();
    });

    test('leaves the socket in the room when it refuses', async () => {
        // A hover refused mid-game must not evict the player who sent it.
        roomGone();
        const socket = fakeSocket();

        await GUARDS.ROOM_MEMBER_SILENT({ socket, payload: { room: ROOM } });

        expect(socket.leave).not.toHaveBeenCalled();
    });
});

describe('GUARDS.ROOM_MEMBER_CACHED', () => {
    /** Every Redis read a check costs, across both repos. */
    const reads = () => mockRoomRepo.getFields.mock.calls.length + mockPlayerRepo.exists.mock.calls.length;

    test('admits a player who is in the room', async () => {
        const result = await GUARDS.ROOM_MEMBER_CACHED({ socket: fakeSocket(), payload: { room: ROOM } });

        expect(result.ok).toBe(true);
        expect(result.roomState).toEqual(expect.objectContaining({ mode: 'co-op' }));
    });

    test('a second hover inside the window reads nothing', async () => {
        const socket = fakeSocket();
        await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: ROOM } });
        const afterFirst = reads();

        const result = await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: ROOM } });

        expect(result.ok).toBe(true);
        expect(result.roomState).toEqual(expect.objectContaining({ mode: 'co-op' }));
        expect(reads()).toBe(afterFirst);
    });

    test('checks again once the window has passed', async () => {
        const socket = fakeSocket();
        const now = jest.spyOn(performance, 'now').mockReturnValue(1000);
        await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: ROOM } });
        const afterFirst = reads();

        now.mockReturnValue(1000 + MEMBER_PASS_MS);
        roomGone();
        const result = await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: ROOM } });
        now.mockRestore();

        expect(reads()).toBeGreaterThan(afterFirst);
        expect(result.ok).toBe(false);
    });

    test('a leave voids the pass at once, without waiting out the window', async () => {
        // Every exit calls socket.leave (removePlayer, a refusing guard, a refused join).
        const socket = fakeSocket();
        await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: ROOM } });

        socket.rooms.delete(ROOM);
        roomGone();
        const result = await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: ROOM } });

        expect(result.ok).toBe(false);
    });

    test('a pass for one room does not admit to another', async () => {
        const socket = fakeSocket();
        socket.rooms.add('WXYZ');
        await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: ROOM } });

        mockRoomRepo.getFields.mockResolvedValue({ players: JSON.stringify(['someone-else']) });
        const result = await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: 'WXYZ' } });

        expect(result.ok).toBe(false);
    });

    test('a refusal is not remembered, so a player who just joined is heard', async () => {
        const socket = fakeSocket();
        roomGone();
        await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: ROOM } });

        everythingPresent();
        const result = await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: ROOM } });

        expect(result.ok).toBe(true);
    });

    test('refuses silently, and leaves the socket in the room', async () => {
        roomGone();
        const socket = fakeSocket();

        const result = await GUARDS.ROOM_MEMBER_CACHED({ socket, payload: { room: ROOM } });

        expect(result.ok).toBe(false);
        expect(socket.emit).not.toHaveBeenCalled();
        expect(socket.leave).not.toHaveBeenCalled();
    });
});
