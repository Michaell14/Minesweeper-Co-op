/**
 * The pipeline every socket route runs inside, applied to every row of
 * `routes/index.js`: rate limit -> validate -> guard -> handler.
 *
 * Rate limiting is FIRST so a flood is stopped before it costs anything (a
 * hover reaching the membership check has already spent Redis reads);
 * validation precedes the guard so a malformed room code never reaches Redis.
 * Every refusal is SILENT; a route that owes the client an error emits it
 * from its guard or handler, where the specific error is known.
 *
 * A `serial` row runs its guard and handler for one socket one event at a
 * time, in arrival order. Rate limit and validate still run on arrival, so a
 * flood is refused before anything is queued.
 */

const { createBucket, takeToken } = require('../domain/rateLimit');

/**
 * Runs `task` after every earlier task queued for this socket and event. A
 * cache lets some events answer without Redis while others wait on it, so
 * without this a later event could finish first. The stored link never
 * rejects, or one failure would stall every event after it; the caller still
 * sees the rejection.
 */
const enqueue = (socket, event, task) => {
    const queues = (socket.data.routeQueues ??= {});
    const run = (queues[event] ?? Promise.resolve()).then(task);
    queues[event] = run.catch(() => {});
    return run;
};

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

        const admitAndHandle = async () => {
            const { ok, roomState } = await route.guard({ socket, payload });
            if (!ok) return;

            await route.handler({ socket, io, payload, roomState });
        };

        await (route.serial ? enqueue(socket, route.event, admitAndHandle) : admitAndHandle());
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
