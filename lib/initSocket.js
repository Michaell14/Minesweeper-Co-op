import { io } from "socket.io-client";

const serverURL = process.env.NODE_ENV === "development"
    ? "http://localhost:3001" // Development URL
    : "https://nameless-coast-33840-33c3fd45fe2d.herokuapp.com/"; // Production URL

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


