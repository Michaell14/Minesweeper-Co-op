import { io } from "socket.io-client";

const serverURL = process.env.NODE_ENV === "development"
    ? "http://localhost:3001" // Development URL
    : "https://minesweeper-co-op.onrender.com"; // Production URL

export function initSocket(sessionId) {
    const socket = io(serverURL, {
        reconnection: true,
        autoConnect: false,
        auth: {
            sessionId: sessionId,
        },
    });
    return socket;
}


