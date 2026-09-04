const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { allowedOrigins } = require('../config');

const app = express();
const server = http.createServer(app);

// CORS, including preflight.
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    // Authorization carries the auth-bridge token on /api requests.
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.get('/', (req, res) => {
    res.send('Hello World! Server is running.')
});

/**
 * Which commit this process is running. HEROKU_SLUG_COMMIT needs dyno metadata
 * enabled, so the usual source is version.json from scripts/write-version.js.
 */
const buildCommit = (() => {
    if (process.env.HEROKU_SLUG_COMMIT) return process.env.HEROKU_SLUG_COMMIT;
    try {
        return require('../version.json').commit || 'unknown';
    } catch {
        return 'unknown';   // local dev, or a build that skipped the hook
    }
})();

/** Health check. `commit` lets the post-deploy check tell a release from the one it replaced. */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', socketio: 'initialized', commit: buildCommit });
});

const io = new Server(server, {
    path: '/socket.io',
    cors: {
        origin: function(origin, callback) {
            // No origin at all means a non-browser client (curl, native app).
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        },
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["Content-Type"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true, // Socket.io v3 clients
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
    }
});

// `app` too: controllers/profileController mounts the /api routes on it.
module.exports = { app, server, io };