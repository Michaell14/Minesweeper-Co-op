/** Server configuration from the environment. Everything has a working default. */

/** Browsers allowed to talk to this server when no ALLOWED_ORIGINS is set. */
const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://minesweeper-test.vercel.app',
    'https://www.minesweepercoop.com',
];

/** Parses a comma-separated origin list; empty or missing falls back rather than locking everyone out. */
const parseOrigins = (raw, fallback = DEFAULT_ALLOWED_ORIGINS) => {
    if (typeof raw !== 'string') return fallback;
    const origins = raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    return origins.length > 0 ? origins : fallback;
};

const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS);

const PORT = process.env.PORT || 3001;

/**
 * How long a PVP racer has to come back before forfeiting. A reload and a quit
 * both arrive as a disconnect, so this must outlast a refresh.
 */
const PVP_RECONNECT_GRACE_MS = parseInt(process.env.PVP_RECONNECT_GRACE_MS, 10) || 12000;

/**
 * Auth bridge secret: the Next app signs a short-lived HS256 JWT with it
 * (app/api/socket-token) and this server verifies it. Must match on both
 * deploys. Unset means sign-in is off; no fallback, or anyone could mint identities.
 */
const AUTH_BRIDGE_SECRET = process.env.AUTH_BRIDGE_SECRET || '';

module.exports = { DEFAULT_ALLOWED_ORIGINS, parseOrigins, allowedOrigins, PORT, PVP_RECONNECT_GRACE_MS, AUTH_BRIDGE_SECRET };
