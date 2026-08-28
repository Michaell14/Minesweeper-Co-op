/**
 * The route guards — who is allowed to act on a room.
 *
 * There are two of them and the difference is the REFUSAL, not the check.
 * `ROOM_MEMBER` answers a refusal with `roomDoesNotExistError` and drops the
 * socket out of the room, which is right for a click on a room that timed out.
 * `ROOM_MEMBER_SILENT` runs the identical check and says nothing, which is what
 * hover and emotes need: they are rate-limited spam surfaces, and answering a
 * refused one with an error would hand a flooding client an amplifier and a
 * legitimate one a false "this room is gone".
 *
 * That distinction used to live in a comment beside two hand-inlined copies of
 * the check. Here it is the guard's name, and these tests are what keep the two
 * from converging.
 */

const mockRoomRepo = { exists: jest.fn(), getState: jest.fn() };
const mockPlayerRepo = { exists: jest.fn() };

jest.mock('../data/roomRepo', () => mockRoomRepo);
jest.mock('../data/playerRepo', () => mockPlayerRepo);

const { GUARDS } = require('../routes/guards');
const { SERVER_EVENTS } = require('../../shared/events');

const ROOM = 'ABCD';
const SOCKET = 'socket-1';

const fakeSocket = () => ({ id: SOCKET, emit: jest.fn(), leave: jest.fn() });

/** The room exists, the player exists, and the player is in it. */
const everythingPresent = () => {
    mockRoomRepo.exists.mockResolvedValue(true);
    mockPlayerRepo.exists.mockResolvedValue(true);
    mockRoomRepo.getState.mockResolvedValue({ players: JSON.stringify([SOCKET]), mode: 'co-op' });
};

beforeEach(() => {
    jest.clearAllMocks();
    everythingPresent();
});

describe('GUARDS.NONE', () => {
    test('admits without reading anything', async () => {
        const result = await GUARDS.NONE({ socket: fakeSocket(), payload: {} });

        expect(result.ok).toBe(true);
        expect(mockRoomRepo.exists).not.toHaveBeenCalled();
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
        mockRoomRepo.exists.mockResolvedValue(false);
        const socket = fakeSocket();

        const result = await GUARDS.ROOM_MEMBER({ socket, payload: { room: ROOM } });

        expect(result.ok).toBe(false);
        expect(socket.emit).toHaveBeenCalledWith(SERVER_EVENTS.ROOM_DOES_NOT_EXIST_ERROR);
    });

    test('drops the socket out of a room it was refused from', async () => {
        mockRoomRepo.exists.mockResolvedValue(false);
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
        mockRoomRepo.getState.mockResolvedValue({ players: JSON.stringify(['someone-else']) });

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
        mockRoomRepo.getState.mockResolvedValue({ players: JSON.stringify(['someone-else']) });

        const result = await GUARDS.ROOM_MEMBER_SILENT({ socket: fakeSocket(), payload: { room: ROOM } });

        expect(result.ok).toBe(false);
    });

    test('says nothing when it refuses', async () => {
        mockRoomRepo.exists.mockResolvedValue(false);
        const socket = fakeSocket();

        await GUARDS.ROOM_MEMBER_SILENT({ socket, payload: { room: ROOM } });

        expect(socket.emit).not.toHaveBeenCalled();
    });

    test('leaves the socket in the room when it refuses', async () => {
        // A hover refused mid-game must not evict the player who sent it.
        mockRoomRepo.exists.mockResolvedValue(false);
        const socket = fakeSocket();

        await GUARDS.ROOM_MEMBER_SILENT({ socket, payload: { room: ROOM } });

        expect(socket.leave).not.toHaveBeenCalled();
    });
});
