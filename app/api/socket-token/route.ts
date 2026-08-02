/**
 * Mints the auth bridge token: a short-lived HS256 JWT carrying the OAuth
 * identity from the NextAuth session cookie, signed with AUTH_BRIDGE_SECRET —
 * the secret the game server shares (server/utils/authToken.js verifies the
 * exact shape minted here; change one side only in step with the other).
 *
 * Why a second token exists at all: NextAuth's own cookie is an encrypted JWE
 * bound to this deploy, deliberately unreadable elsewhere. The game server
 * needs a verifiable identity, not the session — so this route re-signs the
 * minimum claims for it, readable by anything holding the shared secret and
 * nothing else.
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { SignJWT } from "jose";

/** Matches BRIDGE_ISSUER / BRIDGE_AUDIENCE in server/utils/authToken.js. */
const BRIDGE_ISSUER = "minesweeper-web";
const BRIDGE_AUDIENCE = "minesweeper-server";

/**
 * Long enough that a playing session rarely refreshes, short enough that a
 * leaked token goes stale the same afternoon. The client refreshes ahead of
 * expiry (lib/authBridge.ts).
 */
const TOKEN_TTL_SECONDS = 60 * 60;

export async function GET(req: NextRequest) {
    const session = await getToken({ req });

    const provider = typeof session?.provider === "string" ? session.provider : "";
    const providerAccountId =
        typeof session?.providerAccountId === "string" ? session.providerAccountId : "";
    if (!provider || !providerAccountId) {
        return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const secret = process.env.AUTH_BRIDGE_SECRET;
    if (!secret) {
        // Signed in, but the bridge to the game server is not configured on
        // this deploy — the session works, the game just stays anonymous.
        return NextResponse.json({ error: "Auth bridge not configured" }, { status: 503 });
    }

    const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
    const token = await new SignJWT({
        provider,
        providerAccountId,
        email: typeof session?.email === "string" ? session.email : undefined,
        name: typeof session?.name === "string" ? session.name : undefined,
    })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(`${provider}:${providerAccountId}`)
        .setIssuer(BRIDGE_ISSUER)
        .setAudience(BRIDGE_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(Math.floor(expiresAt / 1000))
        .sign(new TextEncoder().encode(secret));

    return NextResponse.json({ token, expiresAt });
}
