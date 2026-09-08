/**
 * The custom-theme sync routes, behind profileController's requireUser. The
 * blob is opaque beyond validation.js's caps; the client re-derives the palette
 * on read, so nothing stored here reaches a style attribute unvetted.
 */

const { requireUser } = require('./profileController');
const themesRepo = require('../data/themesRepo');
const { isValidThemeBlob, isValidThemeId } = require('../validation');

/** Matches MAX_CUSTOM_THEMES in lib/customThemes.ts. */
const MAX_THEMES_PER_USER = 20;

const registerThemesRoutes = (app) => {
    app.get('/api/themes', requireUser, async (req, res) => {
        try {
            const themes = await themesRepo.listThemes(req.user.id);
            res.json({ themes });
        } catch (error) {
            console.error('Postgres error listing themes:', error.message);
            res.status(503).json({ error: 'Themes are temporarily unavailable' });
        }
    });

    app.put('/api/themes/:id', requireUser, async (req, res) => {
        const theme = req.body && req.body.theme;
        if (!isValidThemeId(req.params.id) || !isValidThemeBlob(theme) || theme.id !== req.params.id) {
            res.status(400).json({ error: 'Invalid theme' });
            return;
        }

        try {
            // The cap gates NEW themes only. Two tabs racing it can land at
            // cap+1, a cosmetic overshoot not worth a lock.
            const isUpdate = await themesRepo.hasTheme(req.user.id, theme.id);
            if (!isUpdate && (await themesRepo.countThemes(req.user.id)) >= MAX_THEMES_PER_USER) {
                res.status(409).json({ error: `Theme limit reached (${MAX_THEMES_PER_USER})` });
                return;
            }
            await themesRepo.saveTheme(req.user.id, theme.id, theme);
            res.status(204).end();
        } catch (error) {
            console.error('Postgres error saving theme:', error.message);
            res.status(503).json({ error: 'Themes are temporarily unavailable' });
        }
    });

    app.delete('/api/themes/:id', requireUser, async (req, res) => {
        if (!isValidThemeId(req.params.id)) {
            res.status(400).json({ error: 'Invalid theme id' });
            return;
        }
        try {
            await themesRepo.deleteTheme(req.user.id, req.params.id);
            res.status(204).end(); // idempotent, like account deletion
        } catch (error) {
            console.error('Postgres error deleting theme:', error.message);
            res.status(503).json({ error: 'Themes are temporarily unavailable' });
        }
    });
};

module.exports = { registerThemesRoutes, MAX_THEMES_PER_USER };
