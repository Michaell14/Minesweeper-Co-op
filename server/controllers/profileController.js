/**
 * Accounts at the edge: turning a bridge token into a user, on both transports.
 *
 * The socket path (`resolveSocketUser`) is best-effort by contract — an
 * unverifiable token, a missing database, or a Postgres outage all resolve to
 * null, an anonymous player, because sign-in being down must never keep anyone
 * out of a game. The REST path (`registerProfileRoutes`) is the opposite: it
 * exists only to serve account data, so there it answers honestly with 401/503
 * instead of degrading.
 */

const { verifyBridgeToken } = require('../utils/authToken');
const { isDbEnabled } = require('../utils/initializePgClient');
const userRepo = require('../data/userRepo');
const statsRepo = require('../data/statsRepo');
const { isValidAvatarId, isValidPlayerName, normalizePlayerName } = require('../validation');
const { canUseAvatar, requirementFor } = require('../../shared/avatars');

/** What a fresh account is called when the OAuth profile carries no name. */
const DEFAULT_DISPLAY_NAME = 'Player';

/**
 * Identity → user, cached briefly. Without this every authenticated request —
 * including each debounced settings save — runs the get-or-create UPSERT, a
 * row write per request for data that changes essentially never. The TTL
 * bounds how stale a cached user can be (a token-refreshed email waits one
 * minute); rename and delete update the cache themselves below, so the
 * operations a player actually watches are never stale at all.
 */
const IDENTITY_CACHE_TTL_MS = 60_000;
const identityCache = new Map();

const cacheKey = ({ provider, providerAccountId }) => `${provider}\n${providerAccountId}`;

const cacheUser = (user) => {
    // Crude overflow guard: this is a per-dyno convenience cache, not a store.
    if (identityCache.size >= 1000) identityCache.clear();
    identityCache.set(cacheKey(user), { user, expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS });
};

/** Test seam: cached identities would otherwise leak across test cases. */
const clearIdentityCache = () => identityCache.clear();

/**
 * The account behind a verified identity, created on first sight. The OAuth
 * profile name seeds display_name once; renames stick (see userRepo).
 */
const userForIdentity = async (identity) => {
    const cached = identityCache.get(cacheKey(identity));
    if (cached && cached.expiresAt > Date.now()) return cached.user;

    const user = await userRepo.getOrCreateUser({
        provider: identity.provider,
        providerAccountId: identity.providerAccountId,
        email: identity.email,
        // The stored-name rules apply to OAuth names too: trimmed, non-empty,
        // within length — an OAuth display name is arbitrary user input from
        // another site, not something pre-sanitised.
        displayName: (() => {
            const name = normalizePlayerName(identity.name || '');
            return isValidPlayerName(name) ? name : DEFAULT_DISPLAY_NAME;
        })(),
    });
    cacheUser(user);
    return user;
};

/**
 * The user a connecting socket belongs to, or null for an anonymous player.
 *
 * Called from the io middleware in server.js with `socket.handshake.auth`.
 * Never throws and never blocks a connection: anonymous is a fully supported
 * state, not an error.
 */
const resolveSocketUser = async (handshakeAuth) => {
    const identity = verifyBridgeToken(handshakeAuth && handshakeAuth.authToken);
    if (!identity || !isDbEnabled()) return null;
    try {
        return await userForIdentity(identity);
    } catch (error) {
        console.error('Postgres unavailable during socket auth — continuing anonymous:', error.message);
        return null;
    }
};

/**
 * REST auth: Authorization: Bearer <bridge token> → req.user.
 *
 * 503 before 401 when there is no database: with Postgres unprovisioned the
 * token may well be fine, and "service not available" is the truthful answer
 * rather than blaming the caller's credentials.
 */
const requireUser = async (req, res, next) => {
    if (!isDbEnabled()) {
        res.status(503).json({ error: 'Accounts are not available on this server' });
        return;
    }

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const identity = verifyBridgeToken(token);
    if (!identity) {
        res.status(401).json({ error: 'Not signed in' });
        return;
    }

    try {
        req.user = await userForIdentity(identity);
        next();
    } catch (error) {
        console.error('Postgres error resolving /api user:', error.message);
        res.status(503).json({ error: 'Accounts are temporarily unavailable' });
    }
};

/** The shape every /api/me response uses. Email included — it is their own. */
const publicUser = (user) => ({
    id: user.id,
    provider: user.provider,
    email: user.email,
    displayName: user.displayName,
    avatar: user.avatar,
    createdAt: user.createdAt,
});

/**
 * Mounts the account routes. The server's first HTTP surface beyond health
 * checks — everything else speaks the socket protocol. The /api JSON body
 * parser is mounted by server.js, ahead of every route registration.
 */
const registerProfileRoutes = (app) => {
    app.get('/api/me', requireUser, (req, res) => {
        res.json({ user: publicUser(req.user) });
    });

    app.put('/api/me', requireUser, async (req, res) => {
        // Field-by-field: each is validated only when present, so the rename
        // form and the avatar picker can each send just their own field.
        const body = req.body || {};
        const fields = {};

        if (body.displayName !== undefined) {
            // Same rules as a room name: validate what will be STORED.
            const displayName = normalizePlayerName(body.displayName);
            if (!isValidPlayerName(displayName)) {
                res.status(400).json({ error: 'Invalid display name' });
                return;
            }
            fields.displayName = displayName;
        }

        if (body.avatar !== undefined) {
            // Catalog ids only — including no null-to-clear: there is no unset
            // state, so "reset" is sending 'classic', not sending null.
            if (!isValidAvatarId(body.avatar)) {
                res.status(400).json({ error: 'Invalid avatar' });
                return;
            }
            fields.avatar = body.avatar;
        }

        if (Object.keys(fields).length === 0) {
            res.status(400).json({ error: 'Nothing to update' });
            return;
        }

        /*
         * Everything that TOUCHES Postgres lives in here, entitlement included.
         * Express 4 does not catch a rejected async handler: a throw outside
         * this block is not a wrong status code, it is no response at all —
         * the request hangs until the client gives up, and the picker sits on
         * its optimistic state with nothing to roll back to.
         */
        try {
            /*
             * Earned avatars are checked HERE, the only write path, because the
             * picker's lock is a courtesy: it draws from a payload the client
             * could simply not have fetched. The read is skipped entirely for
             * the ungated majority — most saves stay one round trip.
             */
            if (fields.avatar && requirementFor(fields.avatar)) {
                const earned = await statsRepo.earnedAchievementIds(req.user.id);
                if (!canUseAvatar(fields.avatar, { earned, current: req.user.avatar })) {
                    res.status(403).json({ error: 'That avatar is still locked' });
                    return;
                }
            }

            const updated = await userRepo.updateUser(req.user.id, fields);
            if (!updated) {
                // The row vanished between auth and update — deleted elsewhere.
                identityCache.delete(cacheKey(req.user));
                res.status(404).json({ error: 'Account no longer exists' });
                return;
            }
            // The edit the player is watching must not serve stale for a TTL.
            cacheUser(updated);
            res.json({ user: publicUser(updated) });
        } catch (error) {
            console.error('Postgres error updating user:', error.message);
            res.status(503).json({ error: 'Accounts are temporarily unavailable' });
        }
    });

    app.delete('/api/me', requireUser, async (req, res) => {
        try {
            await userRepo.deleteUser(req.user.id);
            // A cached identity for a deleted account would quietly recreate
            // it on the next request within the TTL.
            identityCache.delete(cacheKey(req.user));
            // Idempotent on purpose: deleting an already-deleted account is
            // the outcome the caller wanted, not an error worth surfacing.
            res.status(204).end();
        } catch (error) {
            console.error('Postgres error deleting user:', error.message);
            res.status(503).json({ error: 'Accounts are temporarily unavailable' });
        }
    });
};

module.exports = { resolveSocketUser, requireUser, registerProfileRoutes, clearIdentityCache };
