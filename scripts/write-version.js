/**
 * Records which commit was built, so the running server can say what it is.
 * Written at BUILD time (from `heroku-postbuild`) because Heroku exposes
 * SOURCE_VERSION to the build and not to the dyno. Without it
 * `npm run verify:deploy` cannot tell the new release from the one it
 * replaced, and would pass against the OLD build. Locally `/health` just
 * reports an unknown commit.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/** Whatever the current build system calls the commit it is building. */
const resolveCommit = () => {
    if (process.env.SOURCE_VERSION) return process.env.SOURCE_VERSION;   // Heroku
    if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
    if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
    try {
        return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
        return null;
    }
};

const commit = resolveCommit();
const target = path.join(__dirname, '..', 'server', 'version.json');

fs.writeFileSync(target, JSON.stringify({ commit, builtAt: new Date().toISOString() }, null, 2));

console.log(
    commit
        ? `Recorded build commit ${commit.slice(0, 9)} in server/version.json`
        : 'No build commit available; server/health will report "unknown".'
);
