/**
 * The settings sync routes. Same transport and failure policy as
 * profileController's REST side, whose requireUser it borrows so there is one
 * definition of "who is this request". The blob is opaque here (see
 * settingsRepo); validation.js only caps its size and shape.
 */

const { requireUser } = require('./profileController');
const settingsRepo = require('../data/settingsRepo');
const { isValidSettingsBlob } = require('../validation');

const registerSettingsRoutes = (app) => {
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
