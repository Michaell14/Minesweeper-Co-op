/**
 * The route table — the server's half of the socket protocol, as data.
 *
 * `server.js` used to register these by hand, which meant the only way to ask
 * "what does this server listen for, and what guards it?" was to read 564 lines
 * and trust that each handler had remembered the same four steps. These tests
 * ask the table instead.
 *
 * They are structural on purpose. What each handler DOES is covered by the
 * suites for the modules behind it (coop, pvp, daily, matchmaking); what this
 * pins is that every event has exactly one row, that every row declares a real
 * guard, and that no row can send an unvalidated room code to Redis.
 */

const { ROUTES } = require('../routes');
const { GUARDS } = require('../routes/guards');
const { CLIENT_EVENTS } = require('../../shared/events');
const {
    HOVER_BURST,
    HOVER_PER_SECOND,
    EXPRESSION_BURST,
    EXPRESSION_PER_SECOND,
} = require('../domain/rateLimit');

const ROOM_GUARDS = [GUARDS.ROOM_MEMBER, GUARDS.ROOM_MEMBER_SILENT];
const eventOf = (route) => route.event;

describe('the table covers the protocol', () => {
    test('every client event has a row', () => {
        const covered = ROUTES.map(eventOf);
        expect(Object.values(CLIENT_EVENTS).filter((event) => !covered.includes(event))).toEqual([]);
    });

    test('no row names an event the protocol does not declare', () => {
        const declared = Object.values(CLIENT_EVENTS);
        expect(ROUTES.map(eventOf).filter((event) => !declared.includes(event))).toEqual([]);
    });

    test('no event is registered twice', () => {
        // socket.io would happily attach both and run them both.
        const events = ROUTES.map(eventOf);
        expect(events.length).toBe(new Set(events).size);
    });
});

describe('every row is well formed', () => {
    test.each(ROUTES.map((route) => [route.event, route]))('%s has a handler', (_event, route) => {
        expect(typeof route.handler).toBe('function');
    });

    test.each(ROUTES.map((route) => [route.event, route]))('%s declares a known guard', (_event, route) => {
        expect(Object.values(GUARDS)).toContain(route.guard);
    });

    test.each(ROUTES.map((route) => [route.event, route]))('%s has a validate, or none to declare', (_event, route) => {
        // Optional, but never a non-function — a typo'd key would otherwise
        // read as "this route needs no validation".
        if (route.validate !== undefined) expect(typeof route.validate).toBe('function');
    });
});

describe('a room guard is never handed an unvalidated room code', () => {
    const roomRoutes = ROUTES.filter((route) => ROOM_GUARDS.includes(route.guard));

    test('there are some, so the filter above is not silently empty', () => {
        expect(roomRoutes.length).toBeGreaterThan(0);
    });

    test.each(roomRoutes.map((route) => [route.event, route]))(
        '%s rejects a payload with no room before the guard runs',
        (_event, route) => {
            // The guard's first move is roomRepo.exists(payload.room). Without
            // a validate that refuses it, that reaches Redis as `undefined`.
            expect(route.validate).toBeDefined();
            expect(route.validate({})).toBe(false);
        },
    );
});

describe('rate limits are fully specified', () => {
    const limited = ROUTES.filter((route) => route.rateLimit);

    test('the rate-limited routes are the ones that fan out on a client\'s say-so', () => {
        expect(limited.map(eventOf).sort()).toEqual([CLIENT_EVENTS.CELL_HOVER, CLIENT_EVENTS.SEND_EMOTE].sort());
    });

    /**
     * A bucket is keyed by CATEGORY, not by event — see domain/rateLimit.js.
     * A second expressive event must reuse `expressionBucket`; giving it its
     * own would let a client alternate the two and send at double the rate
     * either was meant to allow.
     *
     * The rates come from the constants rather than being typed into the table,
     * so the limit has one definition and this catches a hand-typed number.
     */
    test.each([
        [CLIENT_EVENTS.CELL_HOVER, 'hoverBucket', HOVER_BURST, HOVER_PER_SECOND],
        [CLIENT_EVENTS.SEND_EMOTE, 'expressionBucket', EXPRESSION_BURST, EXPRESSION_PER_SECOND],
    ])('%s draws on %s at the rate its category defines', (event, key, burst, perSecond) => {
        const { rateLimit } = ROUTES.find((route) => route.event === event);
        expect(rateLimit).toEqual({ key, burst, perSecond });
    });
});
