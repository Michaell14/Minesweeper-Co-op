/**
 * Rejoining a room after a reload. Most rules are a "don't": don't resume
 * someone who left on purpose, an expired room, or a browser never in a room.
 * Getting one wrong is silent.
 */

const roomRepo = require('../data/roomRepo');
const sessionRepo = require('../data/sessionRepo');
const { offerResume, forgetRoom } = require('../controllers/sessionController');

const SESSION = 'sess-1';
const ROOM = 'ROOM1';

const socketWith = (sessionId) => ({
    emit: jest.fn(),
    handshake: { auth: sessionId === undefined ? {} : { sessionId } },
});

/** A live room this session was last seen in. */
const arrange = ({ session = { room: ROOM, name: 'Alice' }, exists = true } = {}) => {
    jest.spyOn(sessionRepo, 'getState').mockResolvedValue(session);
    jest.spyOn(roomRepo, 'exists').mockResolvedValue(exists);
};

afterEach(() => jest.restoreAllMocks());

describe('offering a resume', () => {
    test('a returning browser is told which room to rejoin', async () => {
        arrange();
        const socket = socketWith(SESSION);

        await expect(offerResume(socket)).resolves.toBe(true);
        expect(socket.emit).toHaveBeenCalledWith('sessionResume', { room: ROOM, name: 'Alice' });
    });

    test('a brand new browser is offered nothing', async () => {
        arrange({ session: {} });
        const socket = socketWith(SESSION);

        await expect(offerResume(socket)).resolves.toBe(false);
        expect(socket.emit).not.toHaveBeenCalled();
    });

    test('a socket with no session id is offered nothing', async () => {
        arrange();
        const socket = socketWith(undefined);

        await expect(offerResume(socket)).resolves.toBe(false);
        expect(socket.emit).not.toHaveBeenCalled();
    });

    /*
     * forgetRoom drops only the room, so the session still knows a name.
     * Resuming on the name alone would put someone back into the game they left.
     */
    test('a session that left on purpose keeps its name but is not resumed', async () => {
        arrange({ session: { name: 'Alice' } });
        const socket = socketWith(SESSION);

        await expect(offerResume(socket)).resolves.toBe(false);
        expect(socket.emit).not.toHaveBeenCalled();
    });

    /* joinRoom is rejected without a name, so this offer could only bounce. */
    test('a session with a room but no name is not offered a resume', async () => {
        arrange({ session: { room: ROOM } });
        const socket = socketWith(SESSION);

        await expect(offerResume(socket)).resolves.toBe(false);
        expect(socket.emit).not.toHaveBeenCalled();
    });

    test('a room that expired while they were away is not offered', async () => {
        arrange({ exists: false });
        const socket = socketWith(SESSION);

        await expect(offerResume(socket)).resolves.toBe(false);
        expect(socket.emit).not.toHaveBeenCalled();
    });

    /*
     * The offer is mode-blind: what a PVP racer needs beyond a co-op player
     * happens in `restorePvpRacer` during the join this triggers. Gating on
     * mode would mean two places deciding whether a resume is possible.
     */
    test('a race is offered too, and the join is what restores it', async () => {
        arrange();
        const socket = socketWith(SESSION);

        await expect(offerResume(socket)).resolves.toBe(true);
        expect(socket.emit).toHaveBeenCalledWith('sessionResume', { room: ROOM, name: 'Alice' });
    });
});

describe('forgetting a room', () => {
    test('leaving on purpose clears the room, so nothing drags the player back', async () => {
        const clearRoom = jest.spyOn(sessionRepo, 'clearRoom').mockResolvedValue(undefined);

        await forgetRoom(socketWith(SESSION));

        expect(clearRoom).toHaveBeenCalledWith(SESSION);
    });

    test('a socket with no session id is a no-op rather than a crash', async () => {
        const clearRoom = jest.spyOn(sessionRepo, 'clearRoom').mockResolvedValue(undefined);

        await forgetRoom(socketWith(undefined));

        expect(clearRoom).not.toHaveBeenCalled();
    });
});
