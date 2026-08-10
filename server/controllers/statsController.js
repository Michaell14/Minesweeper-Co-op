/**
 * The profile-stats routes. Reads only what the game server itself recorded —
 * there is no "submit a result" endpoint, which is the entire
 * server-authoritative promise. The one write is the guest best-times import,
 * accepted knowingly as client-reported (PRD): it seeds a PRIVATE profile via
 * a keep-if-faster upsert, so it can pad a shelf but never corrupt a record
 * someone actually earned faster.
 */

const { requireUser } = require('./profileController');
const statsRepo = require('../data/statsRepo');
const { isValidBestImport } = require('../validation');

const registerStatsRoutes = (app) => {
    app.get('/api/stats', requireUser, async (req, res) => {
        try {
            res.json(await statsRepo.getProfile(req.user.id));
        } catch (error) {
            console.error('Postgres error reading stats:', error.message);
            res.status(503).json({ error: 'Stats are temporarily unavailable' });
        }
    });

    // The sync's read half: bests alone, light enough to hit on every
    // sign-in. /api/stats stays the profile page's five-table payload.
    // userId rides along so the client can scope pulled records to the
    // account they came from — two accounts sharing a browser must not
    // trade records through its localStorage.
    app.get('/api/stats/bests', requireUser, async (req, res) => {
        try {
            res.json({ userId: req.user.id, bests: await statsRepo.getBests(req.user.id) });
        } catch (error) {
            console.error('Postgres error reading bests:', error.message);
            res.status(503).json({ error: 'Stats are temporarily unavailable' });
        }
    });

    app.post('/api/stats/import-bests', requireUser, async (req, res) => {
        const bests = req.body && req.body.bests;
        if (!isValidBestImport(bests)) {
            res.status(400).json({ error: 'Invalid best-times payload' });
            return;
        }

        try {
            await statsRepo.importBests(req.user.id, bests);
            res.status(204).end();
        } catch (error) {
            console.error('Postgres error importing bests:', error.message);
            res.status(503).json({ error: 'Stats are temporarily unavailable' });
        }
    });
};

module.exports = { registerStatsRoutes };
