const express = require('express');
const { app, server, io } = require('./utils/initializeClient');
const { removePlayer } = require('./utils/playerUtils');
const { offerResume } = require('./controllers/sessionController');
const { leaveQueue, broadcastOnlineCount } = require('./controllers/matchmakingController');
const { resolveSocketUser, registerProfileRoutes } = require('./controllers/profileController');
const { registerSettingsRoutes } = require('./controllers/settingsController');
const { registerThemesRoutes } = require('./controllers/themesController');
const { registerStatsRoutes } = require('./controllers/statsController');
const { register: registerSocketRoutes } = require('./routes');
const { PORT } = require('./config');

// The account routes — the server's first HTTP surface beyond health checks.
// The JSON body parser is mounted here, ONCE, ahead of every registration:
// scoped to /api (nothing else on this server reads a body), and owned by no
// particular controller so registration order stays order, not load-bearing.
app.use('/api', express.json());
registerProfileRoutes(app);
registerSettingsRoutes(app);
registerThemesRoutes(app);
registerStatsRoutes(app);

/**
 * Who this socket belongs to, resolved once at connect. `null` is an anonymous
 * player — fully supported, and the guaranteed outcome when the token is
 * absent, invalid, or the database is missing; auth being down never blocks a
 * connection. Skipped on connection-state recovery (`skipMiddlewares: true`),
 * where the previous `socket.data` is restored instead.
 *
 * This is a CONNECT-TIME SNAPSHOT: a rename or deletion mid-session does not
 * update it until the socket reconnects. Consumers that show the name
 * somewhere durable re-read it (dailyController.submitDailyScore); stats
 * writes for a deleted account fail the users FK and are dropped by
 * statsRecorder, which is the intended outcome.
 */
io.use(async (socket, next) => {
    socket.data.user = await resolveSocketUser(socket.handshake.auth);
    next();
});

io.on('connection', async (socket) => {
    /*
     * Every protocol event, from the table in routes/index.js. The registrar
     * wraps each one in the same pipeline — rate limit, validate, guard,
     * handler — so this file has no opinion about any individual event, and
     * adding one never touches it.
     */
    registerSocketRoutes(socket, io);

    /*
     * `disconnect` stays here rather than in the table: it is socket.io's own
     * event, not part of this protocol, and it is connection lifecycle rather
     * than a message anyone sent.
     */
    socket.on('disconnect', async () => {
        // Closing the tab while queued is the ordinary way to leave the queue,
        // so this is the cleanup path that carries the weight. `playerLeave` is
        // deliberately NOT hooked: being in a room and being in the queue are
        // mutually exclusive (findMatch refuses a socket that already has a
        // player record), so there is nothing there to remove.
        await leaveQueue(socket);

        try {
            await removePlayer(socket, socket.id);
        } catch (error) {
            console.error('Error in disconnect:', error);
        }

        // Last, so a cosmetic refresh cannot delay the cleanup above, and after
        // `leaveQueue` so a leaver is never sent their own departure.
        await broadcastOnlineCount();
    });

    // After the routes, deliberately: this can prompt the client to send
    // `joinRoom` straight back, and the handler for it has to already exist
    // when that lands.
    try {
        await offerResume(socket);
    } catch (error) {
        console.error('Error offering session resume:', error);
    }

    // After the resume, which a reloading player is waiting on: this socket now
    // counts towards "how many are here", and anyone queued is one behind.
    await broadcastOnlineCount();
});

/**
 * The backstop under the registrar's own catch, for the rejection nobody
 * wrapped.
 *
 * Node's default for an unhandled rejection is to exit, which on a game server
 * means one unguarded path in one handler ends every game in progress for
 * everyone. Staying up with a logged error is the lesser failure: the room
 * states live in Redis, so the blast radius of continuing is one player's one
 * action, and the blast radius of exiting is the whole server.
 *
 * Deliberately does NOT swallow quietly — anything reaching here is a bug the
 * registrar should have caught, and the log is how it gets found.
 */
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection (server kept running):', reason);
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
