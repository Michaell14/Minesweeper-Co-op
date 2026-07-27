import { io } from "socket.io-client";

const serverURL = process.env.NODE_ENV === "development"
    ? "http://localhost:3001" // Development URL
    : "https://nameless-coast-33840-33c3fd45fe2d.herokuapp.com"; // Production URL (no trailing slash)

export function initSocket() {
    return io(serverURL, {
        reconnection: true,
        autoConnect: false,
    });
}


