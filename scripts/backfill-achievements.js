/**
 * Awards existing players the achievements they already qualify for.
 *
 * Run ONCE by hand after the release that ships achievements:
 *
 *     npm run backfill:achievements
 *
 * Deliberately NOT in the Heroku release phase, unlike migrations. It is
 * idempotent and safe to re-run, but it walks every player row and has nothing
 * to do on any deploy after the first — the release phase blocks the dynos
 * behind it, and a one-off shouldn't.
 *
 * Nothing depends on it: counters read a snapshot, so a returning player
 * collects on their next finished game regardless. This only means the shelf
 * is already populated when they first look. Counters only — see
 * statsRepo.backfillAchievements for why moments cannot be reconstructed.
 */
const { pgPool } = require('../server/utils/initializePgClient');
const statsRepo = require('../server/data/statsRepo');

if (!pgPool) {
    console.log('No DATABASE_URL — nothing to backfill (account features are off).');
    process.exit(0);
}

statsRepo
    .backfillAchievements()
    .then(({ players, awarded }) => {
        console.log(`Backfill complete: ${awarded} achievement(s) awarded across ${players} player(s).`);
    })
    .catch((error) => {
        console.error('Backfill failed:', error.message);
        process.exitCode = 1;
    })
    // Without this the pool's idle client keeps the event loop alive and the
    // script hangs after printing its result.
    .finally(() => pgPool.end());
