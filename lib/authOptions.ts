/**
 * NextAuth configuration: OAuth only, JWT sessions, no database adapter. The
 * Next app owns no user storage; the game server creates the account row the
 * first time it sees the identity, which is why the jwt callback stashes the
 * provider pair the bridge token (app/api/socket-token) carries to Heroku.
 * Providers appear only when their env vars are set: an unset variable
 * degrades (no sign-in button) rather than crashing the deploy.
 */

import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GithubProvider from "next-auth/providers/github";

const providers: AuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
    );
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.push(
        GithubProvider({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
        }),
    );
}

export const authOptions: AuthOptions = {
    providers,
    session: { strategy: "jwt" },
    callbacks: {
        jwt({ token, account }) {
            // `account` exists only on the sign-in request; the claims then ride the session JWT.
            if (account) {
                token.provider = account.provider;
                token.providerAccountId = account.providerAccountId;
            }
            return token;
        },
    },
};
