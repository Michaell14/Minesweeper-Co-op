const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Add CORS middleware to Express (handles preflight requests)
app.use((req, res, next) => {
    const allowedOrigins = [
        'http://localhost:3000',
        'https://minesweeper-test.vercel.app',
        'https://www.minesweepercoop.com'
    ];
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

// Health check route
app.get('/health', (req, res) => {
    res.json({ status: 'ok', socketio: 'initialized' });
});

// Initialize Socket.io with explicit path and CORS settings
const io = new Server(server, {
    path: '/socket.io',
    cors: {
        origin: function(origin, callback) {
            const allowedOrigins = [
                'http://localhost:3000',
                'https://minesweeper-test.vercel.app',
                'https://www.minesweepercoop.com'
            ];
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