const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
            "http://localhost:3000", // Development
            "https://minesweeper-test.vercel.app", // Production
            "https://www.minesweepercoop.com"
        ]
    }
});

module.exports = { server, io };