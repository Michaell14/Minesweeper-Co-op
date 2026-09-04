/**
 * Bridge token -> user, on both transports. The socket path
 * (`resolveSocketUser`) is best-effort: an unverifiable token, a missing
 * database or a Postgres outage all resolve to an anonymous player, because
 * sign-in being down must never keep anyone out of a game. The REST path
 * (`registerProfileRoutes`) serves only account data, so it answers 401/503.
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
 * Identity → user, cached briefly, or every authenticated request (each
 * debounced settings save included) runs the get-or-create UPSERT. The TTL
 * bounds staleness; rename and delete update the cache themselves.
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
        // An OAuth display name is arbitrary input from another site: same stored-name rules.
        displayName: (() => {
            const name = normalizePlayerName(identity.name || '');
            return isValidPlayerName(name) ? name : DEFAULT_DISPLAY_NAME;
        })(),
    });
    cacheUser(user);
    return user;
};

/**
 * The user a connecting socket belongs to, or null for anonymous. Called from
 * the io middleware in server.js; never throws and never blocks a connection.
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
 * REST auth: Authorization: Bearer <bridge token> → req.user. 503 before 401
 * when there is no database: the token may well be fine.
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

/** Mounts the account routes. The /api JSON body parser is mounted by server.js ahead of them. */
const registerProfileRoutes = (app) => {
    app.get('/api/me', requireUser, (req, res) => {
        res.json({ user: publicUser(req.user) });
    });

    app.put('/api/me', requireUser, async (req, res) => {
        // Field-by-field, so the rename form and the avatar picker can each send only their own.
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
            // Catalog ids only; there is no unset state, so "reset" sends 'classic', not null.
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
         * Everything that TOUCHES Postgres lives in here. Express 4 does not
         * catch a rejected async handler: a throw outside this block is no
         * response at all, and the picker sits on its optimistic state.
         */
        try {
            /*
             * Earned avatars are checked HERE, the only write path; the picker's
             * lock is a courtesy. Skipped for the ungated majority.
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
            // A cached identity would quietly recreate the account within the TTL.
            identityCache.delete(cacheKey(req.user));
            // Idempotent: deleting an already-deleted account is the outcome the caller wanted.
            res.status(204).end();
        } catch (error) {
            console.error('Postgres error deleting user:', error.message);
            res.status(503).json({ error: 'Accounts are temporarily unavailable' });
        }
    });
};

module.exports = { resolveSocketUser, requireUser, registerProfileRoutes, clearIdentityCache };
