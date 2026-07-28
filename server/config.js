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

module.exports = { DEFAULT_ALLOWED_ORIGINS, parseOrigins, allowedOrigins, PORT };
