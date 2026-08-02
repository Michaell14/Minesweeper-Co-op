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

const express = require('express');
const { verifyBridgeToken } = require('../utils/authToken');
const { isDbEnabled } = require('../utils/initializePgClient');
const userRepo = require('../data/userRepo');
const { isValidPlayerName, normalizePlayerName } = require('../validation');

/** What a fresh account is called when the OAuth profile carries no name. */
const DEFAULT_DISPLAY_NAME = 'Player';

/**
 * The account behind a verified identity, created on first sight. The OAuth
 * profile name seeds display_name once; renames stick (see userRepo).
 */
const userForIdentity = (identity) =>
    userRepo.getOrCreateUser({
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
    createdAt: user.createdAt,
});

/**
 * Mounts the account routes. The server's first HTTP surface beyond health
 * checks — everything else speaks the socket protocol.
 */
const registerProfileRoutes = (app) => {
    // Scoped to /api: nothing else on this server reads a body at all.
    app.use('/api', express.json());

    app.get('/api/me', requireUser, (req, res) => {
        res.json({ user: publicUser(req.user) });
    });

    app.put('/api/me', requireUser, async (req, res) => {
        // Same rules as a room name: validate what will be STORED.
        const displayName = normalizePlayerName(req.body && req.body.displayName);
        if (!isValidPlayerName(displayName)) {
            res.status(400).json({ error: 'Invalid display name' });
            return;
        }

        try {
            const updated = await userRepo.updateDisplayName(req.user.id, displayName);
            if (!updated) {
                // The row vanished between auth and update — deleted elsewhere.
                res.status(404).json({ error: 'Account no longer exists' });
                return;
            }
            res.json({ user: publicUser(updated) });
        } catch (error) {
            console.error('Postgres error renaming user:', error.message);
            res.status(503).json({ error: 'Accounts are temporarily unavailable' });
        }
    });

    app.delete('/api/me', requireUser, async (req, res) => {
        try {
            await userRepo.deleteUser(req.user.id);
            // Idempotent on purpose: deleting an already-deleted account is
            // the outcome the caller wanted, not an error worth surfacing.
            res.status(204).end();
        } catch (error) {
            console.error('Postgres error deleting user:', error.message);
            res.status(503).json({ error: 'Accounts are temporarily unavailable' });
        }
    });
};

module.exports = { resolveSocketUser, requireUser, registerProfileRoutes };
