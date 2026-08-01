/**
 * Server configuration resolved from the environment.
 *
 * Everything here has a working default, so an unset variable degrades to the
 * previously hardcoded value rather than breaking a deploy.
 */

/** Browsers allowed to talk to this server when no ALLOWED_ORIGINS is set. */
const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://minesweeper-test.vercel.app',
    'https://www.minesweepercoop.com',
];

/**
 * Parses a comma-separated origin list. Blank entries and surrounding spaces are
 * ignored; an empty or missing value falls back rather than locking everyone out.
 */
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
 * How long a PVP racer has to come back before they forfeit.
 *
 * A reload and a quit both reach the server as a disconnect, so the forfeit has
 * to wait long enough for a refresh to complete. Too short and refreshing loses
 * you the game; too long and a real quitter leaves their opponent staring at a
 * race nobody can win.
 */
const PVP_RECONNECT_GRACE_MS = parseInt(process.env.PVP_RECONNECT_GRACE_MS, 10) || 12000;

module.exports = { DEFAULT_ALLOWED_ORIGINS, parseOrigins, allowedOrigins, PORT, PVP_RECONNECT_GRACE_MS };
