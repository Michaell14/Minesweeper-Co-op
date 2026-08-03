/**
 * NextAuth's route — the app's FIRST API route. Until accounts, the frontend
 * spoke only the socket protocol; this and socket-token/ are the exceptions,
 * and both serve auth alone. Game traffic stays on the socket.
 */
import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
