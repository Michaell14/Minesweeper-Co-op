/**
 * Verification of the auth-bridge token — the short-lived JWT the Next app
 * mints after an OAuth sign-in (app/api/socket-token/route.ts) and the client
 * presents here, on the socket handshake and on /api requests.
 *
 * The bridge exists because the two deploys share no session: NextAuth's own
 * cookie is an encrypted JWE bound to the Vercel app, deliberately not
 * something this server can or should read. The bridge token instead carries
 * the minimum this server needs — the OAuth identity — signed HS256 with
 * AUTH_BRIDGE_SECRET, which both deploys hold.
 *
 * Verification never throws: every failure mode (no secret configured, absent
 * token, expired, tampered, wrong issuer) is `null`, meaning "anonymous
 * player" — the same state every player was in before accounts existed.
 */

const jwt = require('jsonwebtoken');
const { AUTH_BRIDGE_SECRET } = require('../config');

/** Pinned on both sides so a token minted for another purpose never verifies. */
const BRIDGE_ISSUER = 'minesweeper-web';
const BRIDGE_AUDIENCE = 'minesweeper-server';

/**
 * The OAuth identity a token proves, or null.
 *
 * @returns {{ provider: string, providerAccountId: string, email: string|null,
 *             name: string|null } | null}
 */
function verifyBridgeToken(token) {
    if (!AUTH_BRIDGE_SECRET) return null; // sign-in not configured on this deploy
    if (typeof token !== 'string' || token === '') return null;

    let claims;
    try {
        claims = jwt.verify(token, AUTH_BRIDGE_SECRET, {
            algorithms: ['HS256'], // pinned — never let the token pick
            issuer: BRIDGE_ISSUER,
            audience: BRIDGE_AUDIENCE,
        });
    } catch {
        return null;
    }

    // The identity pair is what users are keyed by; a token without it proves
    // nothing worth acting on.
    const { provider, providerAccountId, email, name } = claims;
    if (typeof provider !== 'string' || provider === '') return null;
    if (typeof providerAccountId !== 'string' || providerAccountId === '') return null;

    return {
        provider,
        providerAccountId,
        email: typeof email === 'string' && email !== '' ? email : null,
        name: typeof name === 'string' && name.trim() !== '' ? name.trim() : null,
    };
}

module.exports = { verifyBridgeToken, BRIDGE_ISSUER, BRIDGE_AUDIENCE };
