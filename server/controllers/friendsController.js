/**
 * The friend routes — profileController's `requireUser` applied to a graph
 * rather than to a per-player collection.
 *
 * Two policies live here rather than in the repo, because they are about what
 * an ANSWER may reveal rather than about the graph itself:
 *
 *   1. **A block is never named.** Every refusal a blocked account can provoke
 *      answers the same way a missing code does. Telling somebody they were
 *      blocked, and by whom, is the one thing a block is for avoiding.
 *   2. **A code lookup is rate-limited by obscurity, not by this server.** 40
 *      bits and no enumeration endpoint; the honest 404 below is safe because
 *      there is nothing to walk.
 */

const { requireUser } = require('./profileController');
const friendsRepo = require('../data/friendsRepo');
const userRepo = require('../data/userRepo');
const { isValidUserId } = require('../validation');
const { isValidFriendCode, normalizeFriendCode } = require('../domain/friendCode');

const unavailable = (res, error, what) => {
    console.error(`Postgres error ${what}:`, error.message);
    res.status(503).json({ error: 'Friends are temporarily unavailable' });
};

/**
 * What each repo outcome means on the wire.
 *
 * 'blocked' answers 404 — the same as a code nobody holds — so the two are
 * indistinguishable from outside. That is deliberate and is the reason this
 * table exists at all rather than a status per branch inline.
 */
const REQUEST_OUTCOMES = {
    requested: { status: 201, body: { result: 'requested' } },
    accepted: { status: 200, body: { result: 'accepted' } },
    'already-friends': { status: 200, body: { result: 'already-friends' } },
    'already-requested': { status: 200, body: { result: 'already-requested' } },
    blocked: { status: 404, body: { error: 'No account with that code' } },
    // My own block, so naming it reveals nothing to anybody else — and without
    // it, unblocking is a door I cannot find from the inside.
    'blocked-by-me': { status: 409, body: { error: 'You blocked this player. Unblock them first.' } },
    self: { status: 400, body: { error: 'That is your own code' } },
    'cap-reached': { status: 409, body: { error: `Friend limit reached (${friendsRepo.MAX_FRIENDS})` } },
    'their-cap-reached': { status: 409, body: { error: 'That player\'s friend list is full' } },
    'request-cap-reached': {
        status: 409,
        body: { error: `Too many pending requests (${friendsRepo.MAX_OUTGOING_REQUESTS})` },
    },
};

const registerFriendsRoutes = (app) => {
    /**
     * The whole graph, plus this account's own code — one round trip, because
     * the panel draws all of it at once and a code the player cannot see is a
     * code they cannot share.
     */
    app.get('/api/friends', requireUser, async (req, res) => {
        try {
            const [graph, code] = await Promise.all([
                friendsRepo.listGraph(req.user.id),
                userRepo.getOrCreateFriendCode(req.user.id),
            ]);
            res.json({ ...graph, code });
        } catch (error) {
            unavailable(res, error, 'listing friends');
        }
    });

    /** Add by code — or accept, if they had already asked. See requestFriend. */
    app.post('/api/friends', requireUser, async (req, res) => {
        const raw = req.body && req.body.code;
        if (!isValidFriendCode(raw)) {
            res.status(400).json({ error: 'That is not a friend code' });
            return;
        }

        try {
            const them = await userRepo.findByFriendCode(normalizeFriendCode(raw));
            // Same answer as a block, deliberately: see the header.
            if (!them) {
                res.status(404).json({ error: 'No account with that code' });
                return;
            }

            const outcome = REQUEST_OUTCOMES[await friendsRepo.requestFriend(req.user.id, them.id)];
            res.status(outcome.status).json(outcome.body);
        } catch (error) {
            unavailable(res, error, 'adding a friend');
        }
    });

    /**
     * Respond to, or act on, one relationship. The id in the path is the OTHER
     * ACCOUNT's, not the row's: the client already knows who it is acting on,
     * and row ids are a handle to something the client has no other reason to
     * hold.
     */
    app.put('/api/friends/:id', requireUser, async (req, res) => {
        const them = req.params.id;
        const action = req.body && req.body.action;
        if (!isValidUserId(them)) {
            res.status(400).json({ error: 'Invalid account id' });
            return;
        }
        if (!['accept', 'decline', 'block'].includes(action)) {
            res.status(400).json({ error: 'Invalid action' });
            return;
        }
        if (them === req.user.id) {
            res.status(400).json({ error: 'That is your own account' });
            return;
        }

        try {
            if (action === 'block') {
                await friendsRepo.blockUser(req.user.id, them);
                res.status(204).end();
                return;
            }
            if (action === 'decline') {
                await friendsRepo.declineRequest(req.user.id, them);
                res.status(204).end(); // idempotent: nothing to decline is fine
                return;
            }

            const outcome = await friendsRepo.acceptRequest(req.user.id, them);
            if (outcome === 'accepted') {
                res.status(204).end();
            } else if (outcome === 'cap-reached' || outcome === 'their-cap-reached') {
                // Both caps are checked on accept, because a request can
                // outlive the check made when it was sent — see acceptRequest.
                res.status(409).json(REQUEST_OUTCOMES[outcome].body);
            } else {
                res.status(404).json({ error: 'No request from that account' });
            }
        } catch (error) {
            unavailable(res, error, 'updating a friendship');
        }
    });

    /** Unfriend, cancel a request, or lift my own block — see removeEdge. */
    app.delete('/api/friends/:id', requireUser, async (req, res) => {
        if (!isValidUserId(req.params.id)) {
            res.status(400).json({ error: 'Invalid account id' });
            return;
        }
        try {
            await friendsRepo.removeEdge(req.user.id, req.params.id);
            res.status(204).end(); // idempotent, like account deletion
        } catch (error) {
            unavailable(res, error, 'removing a friendship');
        }
    });
};

module.exports = { registerFriendsRoutes };
