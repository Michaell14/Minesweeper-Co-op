const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
app.get('/', (req, res) => {
    res.send('Hello World!')
})
const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:3000", // Development
            "https://minesweeper-test.vercel.app", // Production
            "https://www.minesweepercoop.com"
        ]
    },
    connectionStateRecovery: {
        // the backup duration of the sessions and the packets
        maxDisconnectionDuration: 2 * 60 * 1000,
        // whether to skip middlewares upon successful recovery
        skipMiddlewares: true,
    }
});

module.exports = { server, io };