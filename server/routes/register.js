/**
 * The pipeline every socket route runs inside, applied to every row of
 * `routes/index.js`: rate limit -> validate -> guard -> handler.
 *
 * Rate limiting is FIRST so a flood is stopped before it costs anything (a
 * hover reaching the membership check has already spent four Redis reads);
 * validation precedes the guard so a malformed room code never reaches Redis.
 * Every refusal is SILENT; a route that owes the client an error emits it
 * from its guard or handler, where the specific error is known.
 */

const { createBucket, takeToken } = require('../domain/rateLimit');

/**
 * Turns one route into a socket listener. The try/catch cannot live inside
 * the handler: handlers destructure their payload in the PARAMETER LIST, so an
 * absent payload threw before any body ran, and an unhandled rejection in an
 * async listener ends the process. `?? {}` suffices since each handler already
 * refuses a wrong field the way it refuses a missing one.
 */
const wrapRoute = (route, { socket, io }) => async (rawPayload) => {
    try {
        const payload = rawPayload ?? {};

        if (route.rateLimit) {
            const { key, burst, perSecond } = route.rateLimit;
            // On `socket.data`, so it is collected with the socket rather than pruned from a Map.
            socket.data[key] ??= createBucket(burst, perSecond);
            // Monotonic, not the wall clock: NTP must not be able to steer a limiter (domain/rateLimit.js).
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
 * Attaches a whole table to one socket. Takes the table as an argument so the
 * pipeline can be tested without every controller behind it.
 */
const registerRoutes = (routes, { socket, io }) => {
    routes.forEach((route) => socket.on(route.event, wrapRoute(route, { socket, io })));
};

module.exports = { wrapRoute, registerRoutes };
