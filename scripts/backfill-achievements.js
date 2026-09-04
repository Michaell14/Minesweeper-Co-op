/**
 * Awards existing players the achievements they already qualify for. Run ONCE
 * by hand after the release that ships achievements (`npm run
 * backfill:achievements`), not in the Heroku release phase: it walks every
 * player row and has nothing to do on later deploys. Idempotent. Counters only;
 * see statsRepo.backfillAchievements for why moments cannot be reconstructed.
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
    // The pool's idle client would otherwise keep the event loop alive.
    .finally(() => pgPool.end());
