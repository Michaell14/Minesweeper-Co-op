/**
 * Records which commit was built, so the running server can say what it is.
 *
 * Written at BUILD time because that is the only moment the commit is known:
 * Heroku exposes SOURCE_VERSION to the build and not to the dyno, and the slug
 * has no git history to ask.
 *
 * This exists for the post-deploy check. Without it, CI has no way to tell the
 * new release from the one it replaced, so `npm run verify:deploy` would run
 * against whatever happened to be live — passing against the OLD build and
 * reporting the release as verified. A green check that proves nothing is worse
 * than no check.
 *
 * Runs from `heroku-postbuild`. Locally there is nothing to write and nothing
 * that reads it; `/health` just reports an unknown commit.
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
