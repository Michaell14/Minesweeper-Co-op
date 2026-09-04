/**
 * Verification of the auth-bridge token, the short-lived JWT the Next app
 * mints after OAuth sign-in (app/api/socket-token/route.ts). The two deploys
 * share no session (NextAuth's cookie is a JWE bound to Vercel), so the token
 * carries just the OAuth identity, signed HS256 with AUTH_BRIDGE_SECRET.
 * Never throws: every failure is `null`, meaning "anonymous player".
 */

const jwt = require('jsonwebtoken');
const { AUTH_BRIDGE_SECRET } = require('../config');

/** Pinned on both sides so a token minted for another purpose never verifies. */
const BRIDGE_ISSUER = 'minesweeper-web';
const BRIDGE_AUDIENCE = 'minesweeper-server';

/**
 * The OAuth identity a token proves, or null.
 * @returns {{ provider: string, providerAccountId: string, email: string|null, name: string|null } | null}
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

    // Users are keyed by the identity pair; a token without it proves nothing.
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
