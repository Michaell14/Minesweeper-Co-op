const express = require('express');
const { app, server, io } = require('./utils/initializeClient');
const { removePlayer } = require('./utils/playerUtils');
const { offerResume } = require('./controllers/sessionController');
const { leaveQueue, broadcastOnlineCount } = require('./controllers/matchmakingController');
const { resolveSocketUser, registerProfileRoutes } = require('./controllers/profileController');
const { registerSettingsRoutes } = require('./controllers/settingsController');
const { registerThemesRoutes } = require('./controllers/themesController');
const { registerFriendsRoutes } = require('./controllers/friendsController');
const { registerStatsRoutes } = require('./controllers/statsController');
const presence = require('./utils/presence');
const { register: registerSocketRoutes } = require('./routes');
const { PORT } = require('./config');

// The JSON body parser is mounted ONCE, scoped to /api and owned by no
// controller, so registration order stays order rather than load-bearing.
app.use('/api', express.json());
registerProfileRoutes(app);
registerSettingsRoutes(app);
registerThemesRoutes(app);
registerFriendsRoutes(app);
registerStatsRoutes(app);

/**
 * Who this socket belongs to, resolved once at connect. `null` is an anonymous
 * player, and the guaranteed outcome when the token is absent, invalid, or the
 * database is missing; auth being down never blocks a connection. Skipped on
 * connection-state recovery (`skipMiddlewares: true`). A CONNECT-TIME SNAPSHOT:
 * a rename or deletion mid-session shows only on reconnect; durable consumers
 * re-read it (dailyController.submitDailyScore), and stats writes for a deleted
 * account fail the users FK and are dropped.
 */
io.use(async (socket, next) => {
    socket.data.user = await resolveSocketUser(socket.handshake.auth);
    next();
});

io.on('connection', async (socket) => {
    /*
     * Every protocol event, from the table in routes/index.js. The registrar
     * applies rate limit, validate, guard, handler, so adding one never touches this file.
     */
    registerSocketRoutes(socket, io);

    /*
     * `disconnect` stays out of the table: it is socket.io's own lifecycle
     * event, not a protocol message.
     */
    socket.on('disconnect', async () => {
        // Closing the tab while queued is the ordinary way to leave the queue.
        // `playerLeave` is NOT hooked: a socket in a room is never in the queue.
        await leaveQueue(socket);

        try {
            await removePlayer(socket, socket.id);
        } catch (error) {
            console.error('Error in disconnect:', error);
        }

        // Last, so a cosmetic refresh cannot delay the cleanup above, and after
        // `leaveQueue` so a leaver is never sent their own departure.
        await broadcastOnlineCount();

        // Best-effort: presence is cosmetic, and a Postgres outage must not hold up a disconnect.
        await presence.onDisconnect(socket);
    });

    // After the routes: this can prompt an immediate `joinRoom`, whose handler must already exist.
    try {
        await offerResume(socket);
    } catch (error) {
        console.error('Error offering session resume:', error);
    }

    // After the resume a reloading player is waiting on; this socket now counts as here.
    await broadcastOnlineCount();

    // Guests fall straight through this; it needs an account to have a graph.
    await presence.onConnect(socket);
});

/**
 * The backstop under the registrar's own catch. Node's default for an
 * unhandled rejection is to exit, which ends every game in progress for one
 * unguarded path. Room state lives in Redis, so continuing costs one player's
 * one action. Logged loudly: anything reaching here is a bug.
 */
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection (server kept running):', reason);
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
