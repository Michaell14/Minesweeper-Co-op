import express from 'express';
import * as http from 'http';
import { Server } from 'socket.io';

const singleton = {
    io: null as any,
    server: null as any
};

export function initializeClient() {
    if (singleton.io && singleton.server) {
        return { server: singleton.server, io: singleton.io };
    }

    const app = express();
    singleton.server = http.createServer(app);
    singleton.io = new Server(singleton.server, {
        cors: {
            origin: [
                "http://localhost:3000", // Development
                "https://minesweeper-test.vercel.app", // Production
                "https://www.minesweepercoop.com"
            ]
        }
    });

    return { server: singleton.server, io: singleton.io };
}

const { io, server } = initializeClient();
export { io, server }; 