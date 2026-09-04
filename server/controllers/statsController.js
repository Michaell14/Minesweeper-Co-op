/**
 * The profile-stats routes. Reads only what the game server recorded — there
 * is no "submit a result" endpoint. The one write is the guest best-times
 * import, client-reported by design (PRD): a keep-if-faster upsert into a
 * PRIVATE profile can pad a shelf but never beat a record someone earned.
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

    /*
     * The board records alone, what the GAME reads. Fetched on sign-in by every
     * tab with a board, so it skips the profile's other queries.
     */
    app.get('/api/stats/bests', requireUser, async (req, res) => {
        try {
            res.json({ boardBests: await statsRepo.getBoardBests(req.user.id) });
        } catch (error) {
            console.error('Postgres error reading board bests:', error.message);
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
