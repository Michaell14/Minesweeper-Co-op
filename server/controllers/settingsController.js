/**
 * The settings sync routes. Same transport and failure policy as the REST
 * side of profileController — bearer-authenticated, honest 401/503 — and it
 * borrows that module's requireUser so there is exactly one definition of
 * "who is this request".
 *
 * The blob itself is opaque here (see settingsRepo); validation.js only caps
 * its size and shape.
 */

const { requireUser } = require('./profileController');
const settingsRepo = require('../data/settingsRepo');
const { isValidSettingsBlob } = require('../validation');

const registerSettingsRoutes = (app) => {
    // express.json() for /api is mounted by registerProfileRoutes, which
    // server.js registers first.

    app.get('/api/settings', requireUser, async (req, res) => {
        try {
            const settings = await settingsRepo.getSettings(req.user.id);
            res.json({ settings }); // null when this account has never synced
        } catch (error) {
            console.error('Postgres error reading settings:', error.message);
            res.status(503).json({ error: 'Settings are temporarily unavailable' });
        }
    });

    app.put('/api/settings', requireUser, async (req, res) => {
        const settings = req.body && req.body.settings;
        if (!isValidSettingsBlob(settings)) {
            res.status(400).json({ error: 'Invalid settings' });
            return;
        }

        try {
            await settingsRepo.saveSettings(req.user.id, settings);
            res.status(204).end();
        } catch (error) {
            console.error('Postgres error saving settings:', error.message);
            res.status(503).json({ error: 'Settings are temporarily unavailable' });
        }
    });
};

module.exports = { registerSettingsRoutes };
