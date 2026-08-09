/**
 * The stored `milestones` field back to an array (see shared/pace.js for the
 * maths). Redis holds strings, and attempts from before pace existed have no
 * field at all — both read as [] so "no pace data" and "none recorded yet"
 * are the same case everywhere.
 */

const { PACE_DECILES } = require('../../shared/pace');

const parseMilestones = (raw) => {
    if (!raw) return [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0).slice(0, PACE_DECILES);
};

module.exports = { parseMilestones };
