const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { allowedOrigins } = require('../config');

const app = express();
const server = http.createServer(app);

// Add CORS middleware to Express (handles preflight requests)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Test route to verify server is running
app.get('/', (req, res) => {
    res.send('Hello World! Server is running.')
});

/**
 * Which commit this process is running.
 *
 * HEROKU_SLUG_COMMIT is only set when dyno metadata is enabled, so the usual
 * source is version.json, written at build time by scripts/write-version.js.
 * Read once: it cannot change without a restart.
 */
const buildCommit = (() => {
    if (process.env.HEROKU_SLUG_COMMIT) return process.env.HEROKU_SLUG_COMMIT;
    try {
        return require('../version.json').commit || 'unknown';
    } catch {
        return 'unknown';   // local dev, or a build that skipped the hook
    }
})();

/**
 * Health check. `commit` is what lets the post-deploy check tell a finished
 * release from the one it replaced — see .github/workflows/ci.yml.
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', socketio: 'initialized', commit: buildCommit });
});

// Initialize Socket.io with explicit path and CORS settings
const io = new Server(server, {
    path: '/socket.io',
    cors: {
        origin: function(origin, callback) {
            // Allow requests with no origin (mobile apps, curl, etc.)
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
    allowEIO3: true, // Enable compatibility with Socket.io v3 clients
    connectionStateRecovery: {
        // the backup duration of the sessions and the packets
        maxDisconnectionDuration: 2 * 60 * 1000,
        // whether to skip middlewares upon successful recovery
        skipMiddlewares: true,
    }
});

module.exports = { server, io };