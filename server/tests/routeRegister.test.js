/**
 * The route registrar — the pipeline every socket handler runs inside.
 *
 * `server.js` used to spell that pipeline out per handler: a `safe` wrapper, a
 * payload check, a membership check, a try/catch. Twenty-two handlers meant
 * twenty-two chances to put those in the wrong order, and one of them —
 * rate limiting BEFORE anything touches Redis — is load-bearing rather than
 * tidy: a hover flood that reaches the membership check has already cost four
 * Redis reads per message, which is the failure a bucket exists to prevent.
 *
 * These tests pin the ORDER, not just the outcome, with synthetic routes. The
 * real table is checked in routes.test.js.
 */

const { wrapRoute, registerRoutes } = require('../routes/register');

/** A socket with just the surface the registrar touches. */
const fakeSocket = () => ({
    id: 'socket-1',
    data: {},
    emit: jest.fn(),
    leave: jest.fn(),
    on: jest.fn(),
});

const ok = async () => ({ ok: true });

describe('wrapRoute', () => {
    test('hands the handler the socket, io and payload', async () => {
        const socket = fakeSocket();
        const io = { to: jest.fn() };
        const handler = jest.fn();

        await wrapRoute({ event: 'x', guard: ok, handler }, { socket, io })({ room: 'ABCD' });

        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({ socket, io, payload: { room: 'ABCD' } }),
        );
    });

    test('a missing payload reaches the handler as an empty object', async () => {
        // Handlers destructure in the parameter list, which runs before their
        // own try/catch — an absent payload used to throw where nothing could
        // catch it, and in an async listener that ends the process.
        const handler = jest.fn();

        await wrapRoute({ event: 'x', guard: ok, handler }, { socket: fakeSocket(), io: {} })(undefined);

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ payload: {} }));
    });

    test('a throwing handler is logged, not rethrown', async () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const handler = () => { throw new Error('boom'); };

        const listener = wrapRoute({ event: 'openCell', guard: ok, handler }, { socket: fakeSocket(), io: {} });
        await expect(listener({})).resolves.toBeUndefined();

        // Named, so the log says which route failed.
        expect(spy.mock.calls[0][0]).toContain('openCell');
        spy.mockRestore();
    });

    test('a payload that fails validate never reaches the handler', async () => {
        const handler = jest.fn();
        const route = { event: 'x', validate: () => false, guard: ok, handler };

        await wrapRoute(route, { socket: fakeSocket(), io: {} })({ room: '!!' });

        expect(handler).not.toHaveBeenCalled();
    });

    test('a refused guard never reaches the handler', async () => {
        const handler = jest.fn();
        const route = { event: 'x', guard: async () => ({ ok: false }), handler };

        await wrapRoute(route, { socket: fakeSocket(), io: {} })({ room: 'ABCD' });

        expect(handler).not.toHaveBeenCalled();
    });

    test('validate runs before the guard, so a bad payload costs no Redis read', async () => {
        const guard = jest.fn(ok);
        const route = { event: 'x', validate: () => false, guard, handler: jest.fn() };

        await wrapRoute(route, { socket: fakeSocket(), io: {} })({});

        expect(guard).not.toHaveBeenCalled();
    });

    test('the rate limit runs before validate, so a flood costs nothing at all', async () => {
        const validate = jest.fn(() => true);
        const guard = jest.fn(ok);
        const socket = fakeSocket();
        const route = {
            event: 'cellHover',
            rateLimit: { key: 'testBucket', burst: 1, perSecond: 0 },
            validate,
            guard,
            handler: jest.fn(),
        };
        const listener = wrapRoute(route, { socket, io: {} });

        await listener({ room: 'ABCD' });
        await listener({ room: 'ABCD' });

        // One message got through; the second was refused before either check.
        expect(validate).toHaveBeenCalledTimes(1);
        expect(guard).toHaveBeenCalledTimes(1);
    });

    test('a refused message is dropped silently — no error reaches the client', async () => {
        const socket = fakeSocket();
        const route = {
            event: 'cellHover',
            rateLimit: { key: 'testBucket', burst: 1, perSecond: 0 },
            guard: ok,
            handler: jest.fn(),
        };
        const listener = wrapRoute(route, { socket, io: {} });

        await listener({});
        await listener({});

        expect(socket.emit).not.toHaveBeenCalled();
    });

    test('the bucket lives on the socket, so it is collected with the socket', async () => {
        const socket = fakeSocket();
        const route = {
            event: 'cellHover',
            rateLimit: { key: 'hoverBucket', burst: 2, perSecond: 1 },
            guard: ok,
            handler: jest.fn(),
        };

        await wrapRoute(route, { socket, io: {} })({});

        expect(socket.data.hoverBucket).toBeDefined();
    });

    test('the guard hands its room state down, so the handler need not re-read it', async () => {
        const handler = jest.fn();
        const roomState = { mode: 'pvp', numRows: '16' };
        const route = { event: 'x', guard: async () => ({ ok: true, roomState }), handler };

        await wrapRoute(route, { socket: fakeSocket(), io: {} })({ room: 'ABCD' });

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ roomState }));
    });
});

describe('registerRoutes', () => {
    test('attaches one listener per route, under its event name', () => {
        const socket = fakeSocket();
        const table = [
            { event: 'openCell', guard: ok, handler: jest.fn() },
            { event: 'chordCell', guard: ok, handler: jest.fn() },
        ];

        registerRoutes(table, { socket, io: {} });

        expect(socket.on.mock.calls.map(([event]) => event)).toEqual(['openCell', 'chordCell']);
    });

    test('what it attaches is the wrapped route, not the bare handler', async () => {
        // The pipeline is the point; attaching handlers raw would skip it.
        const socket = fakeSocket();
        const handler = jest.fn();

        registerRoutes([{ event: 'x', validate: () => false, guard: ok, handler }], { socket, io: {} });
        await socket.on.mock.calls[0][1]({});

        expect(handler).not.toHaveBeenCalled();
    });
});
