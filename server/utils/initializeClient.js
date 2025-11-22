const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

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
        origin: [
            "http://localhost:3000", // Development
            "https://minesweeper-test.vercel.app", // Production
            "https://www.minesweepercoop.com"
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    connectionStateRecovery: {
        // the backup duration of the sessions and the packets
        maxDisconnectionDuration: 2 * 60 * 1000,
        // whether to skip middlewares upon successful recovery
        skipMiddlewares: true,
    }
});

module.exports = { server, io };