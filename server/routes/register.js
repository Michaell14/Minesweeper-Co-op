/**
 * The pipeline every socket route runs inside.
 *
 * One implementation, applied to every row of the table in `routes/index.js`,
 * so the order below is the order for all of them:
 *
 *   rate limit -> validate -> guard -> handler
 *
 * That order is load-bearing, not tidiness. Rate limiting comes FIRST because
 * it exists to stop a flood before it costs anything: a hover that reaches the
 * membership check has already spent four Redis reads, and one socket ignoring
 * the client's throttle once pushed an uninvolved room from 6ms to 2785ms per
 * request. Validation comes before the guard for the same reason one step down
 * — a malformed room code should never reach Redis.
 *
 * Every refusal is SILENT. A route that owes the client an error emits it from
 * its guard or its handler, where the specific error is known; nothing generic
 * is invented here.
 */

const { createBucket, takeToken } = require('../domain/rateLimit');

/**
 * Turns one route into a socket listener.
 *
 * The try/catch is the outer one every handler used to carry itself. It cannot
 * live inside the handler: handlers destructure their payload in the PARAMETER
 * LIST, which runs before any body, so an absent payload threw where nothing
 * could catch it — and in an async listener an unhandled rejection ends the
 * process. `?? {}` is what the handlers actually need, since each one already
 * refuses a wrong field the same way it refuses a missing one.
 */
const wrapRoute = (route, { socket, io }) => async (rawPayload) => {
    try {
        const payload = rawPayload ?? {};

        if (route.rateLimit) {
            const { key, burst, perSecond } = route.rateLimit;
            // On `socket.data`, so it is collected with the socket rather than
            // accumulating in a Map something has to remember to prune.
            socket.data[key] ??= createBucket(burst, perSecond);
            // Monotonic, not the wall clock: a limiter must not be steerable by
            // NTP stepping the clock backwards. See domain/rateLimit.js.
            if (!takeToken(socket.data[key], performance.now())) return;
        }

        if (route.validate && !route.validate(payload)) return;

        const { ok, roomState } = await route.guard({ socket, payload });
        if (!ok) return;

        await route.handler({ socket, io, payload, roomState });
    } catch (error) {
        console.error(`Unhandled error in ${route.event}:`, error);
    }
};

/**
 * Attaches a whole table to one socket.
 *
 * Takes the table as an argument rather than reaching for the real one, so the
 * pipeline can be tested without pulling in every controller behind it — and so
 * nothing here has an opinion about which routes exist.
 */
const registerRoutes = (routes, { socket, io }) => {
    routes.forEach((route) => socket.on(route.event, wrapRoute(route, { socket, io })));
};

module.exports = { wrapRoute, registerRoutes };
