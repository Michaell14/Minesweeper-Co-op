#!/usr/bin/env node
/**
 * End-to-end UI smoke test.
 *
 * Drives the real client in headless Chrome against a local backend, which is
 * the only automated coverage the frontend has -- there are no unit tests for
 * components. Run it after touching anything under app/, components/ or hooks/.
 *
 *   npm run dev:all        # in one terminal: redis + backend :3001 + client :3000
 *   npm run test:ui        # in another
 *
 * Covers: creating a room, the first-click cascade, flagging, the flag counter,
 * reset, leaving, and a two-client PVP round (lobby, start, per-player boards,
 * opponent progress).
 *
 * NOT covered: chording. Making a chord do something visible requires knowing
 * where the mines are, which a browser client deliberately cannot see since
 * boards are projected server-side. Test that against the server instead.
 */
const { launchChrome, attach, newTarget, sleep } = require('./cdp');

const CLIENT = process.env.UI_SMOKE_CLIENT || 'http://localhost:3000';
const SERVER = process.env.UI_SMOKE_SERVER || 'http://localhost:3001';

let failures = 0;
const pass = (label) => console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
const fail = (label, detail) => { failures++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? '\n        ' + detail : ''}`); };
const check = (condition, label, detail) => (condition ? pass(label) : fail(label, detail));

/**
 * Waits for an expression to become true and reports whether it did, instead of
 * throwing. For assertions about a second client, which may lag the first.
 */
const settles = (page, expression, timeout = 8000) =>
    page.waitFor(expression, { timeout }).then(() => true).catch(() => false);

/**
 * There is exactly one board in the DOM.
 *
 * These used to pick the visible grid out of two, because Grid.tsx rendered the
 * board once per layout. They can address it directly now — and `gridCount`
 * below asserts that, so this stays honest if the duplication ever returns.
 */
const VISIBLE_CELLS = `
    const grid = document.querySelector('[role=grid]');
    return grid ? [...grid.querySelectorAll('[role=gridcell]')] : [];
`;
const revealedCount = `(() => {
    const grid = document.querySelector('[role=grid]');
    return [...grid.querySelectorAll('[role=gridcell]')].filter(c => !(c.getAttribute('aria-label') || '').startsWith('Unrevealed')).length;
})()`;
const gridCount = `document.querySelectorAll('[role=grid]').length`;
const cellCount = `document.querySelectorAll('[role=gridcell]').length`;

async function preflight() {
    const probe = async (url, what) => {
        try {
            const r = await fetch(url);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
        } catch (e) {
            console.error(`\nCannot reach the ${what} at ${url} (${e.message}).\n` +
                          `Start everything first:  npm run dev:all\n`);
            process.exit(1);
        }
    };
    await probe(CLIENT, 'client');
    await probe(`${SERVER}/health`, 'game server');
}

/** Fills the room form, then the name dialog, and waits for the board. */
async function enterRoom(page, { room, name, mode }) {
    const formLabel = mode === 'join' ? 'Join existing room form' : 'Create new room form';
    const dialogId = mode === 'join' ? 'dialog-name-join' : 'dialog-name-create';

    if (mode === 'pvp') {
        await page.evaluate(`
            const el = [...document.querySelectorAll('div, label, button, [role=radio]')]
                .filter(e => e.offsetParent !== null && e.textContent.trim().startsWith('PvP'))
                .sort((a, b) => a.textContent.length - b.textContent.length)[0];
            if (!el) throw new Error('no PvP mode option');
            el.click();
            return true;
        `);
        await sleep(250);
    }

    await page.type(`form[aria-label="${formLabel}"] input`, room);
    await page.click(`form[aria-label="${formLabel}"] button[type=submit]`);
    await page.waitFor(`document.getElementById('${dialogId}')?.open`, { label: `${name}: name dialog opens` });
    await page.type(`#${dialogId} input[name="name"]`, name);
    await page.click(`#${dialogId} button[type=submit]`);
}

async function coop(page) {
    console.log('\n\x1b[1m--- CO-OP ---\x1b[0m');
    const room = 'smoke' + Date.now().toString().slice(-6);

    await page.goto(CLIENT);
    // A cold `next dev` compiles on first request; wait for hydration, not just markup.
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 60000, label: 'landing page compiles and renders' });
    pass('landing renders the create-room form');

    await enterRoom(page, { room, name: 'Alice' });
    // `>=` rather than `===` so a duplicated board does not stall here for ten
    // seconds and report a timeout; the check below then names the real problem.
    await page.waitFor(`${cellCount} >= 256`, { label: 'a 16x16 board renders' });
    pass('createRoom round-trips and the board renders');

    // One board, not one per layout. The duplicate copy was invisible, so
    // nothing on screen gave it away — only the cell count does.
    check(await page.evaluate(`return ${gridCount};`) === 1 && await page.evaluate(`return ${cellCount};`) === 256,
        'the board is mounted once (1 grid, 256 cells)',
        `got ${await page.evaluate(`return ${gridCount};`)} grids and ${await page.evaluate(`return ${cellCount};`)} cells; ` +
        'a second copy means Grid.tsx is rendering the board per layout again');
    check(await page.evaluate(`return document.body.textContent.includes(${JSON.stringify(room)});`), 'room code is displayed');

    const flagsRemaining = () => page.evaluate(`
        const el = [...document.querySelectorAll('strong')].find(e => /^\\s*-?\\d+\\s*$/.test(e.textContent));
        return el ? parseInt(el.textContent, 10) : null;
    `);
    check((await flagsRemaining()) === 40, 'flag counter starts at 40');

    // First click: a real mouse click on the visible board.
    await page.click('[role=grid] [role=gridcell]', { nth: 100 });
    await page.waitFor(`${revealedCount} > 0`, { label: 'first click reveals cells' });
    const revealed = await page.evaluate(`return ${revealedCount};`);
    check(revealed > 1, `first click cascaded (${revealed} cells revealed)`, 'expected a cascade, not a single cell');

    // Scoring is a point per cell opened, so a cascade of N is worth N — the
    // leaderboard is where a regression to one-point-per-click would show.
    const leaderboardScore = () => page.evaluate(`
        const table = [...document.querySelectorAll('table')].find(t => t.offsetParent !== null);
        if (!table) return null;
        const row = table.querySelector('tbody tr');
        return row ? parseInt(row.cells[1].textContent, 10) : null;
    `);
    await page.waitFor(`(() => {
        const table = [...document.querySelectorAll('table')].find(t => t.offsetParent !== null);
        const row = table && table.querySelector('tbody tr');
        return !!row && parseInt(row.cells[1].textContent, 10) > 0;
    })()`, { label: 'the leaderboard shows a score' });
    const score = await leaderboardScore();
    check(score === revealed,
        `the cascade scored a point per cell (${score} for ${revealed} cells)`,
        `expected ${revealed}, got ${score} — one point per click would show 1`);

    // Flagging a closed cell.
    const before = await flagsRemaining();
    await page.evaluate(`
        const grid = document.querySelector('[role=grid]');
        const closed = [...grid.querySelectorAll('[role=gridcell]')].find(c => (c.getAttribute('aria-label') || '').startsWith('Unrevealed'));
        if (!closed) throw new Error('no closed cell left to flag');
        closed.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        return true;
    `);
    await sleep(600);
    const after = await flagsRemaining();
    check(after === before - 1, `right-click flags a cell (counter ${before} -> ${after})`);
    check(await page.evaluate(`return document.body.textContent.includes('🚩');`), 'the flag renders on the board');

    // Reset.
    await page.evaluate(`
        const btn = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.trim() === 'Reset Board');
        if (!btn) throw new Error('no Reset Board button');
        btn.click();
        return true;
    `);
    await page.waitFor(`${revealedCount} === 0`, { label: 'reset closes every cell' });
    pass('resetGame closes every cell');
    check((await flagsRemaining()) === 40, 'flag counter returns to 40 after reset');

    // Leave.
    await page.evaluate(`
        const btn = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.includes('Return to Home'));
        btn.click();
        return true;
    `);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"]')`, { label: 'returns to landing' });
    pass('leaveRoom returns to the Landing page');
}

async function pvp(host, guest) {
    console.log('\n\x1b[1m--- PVP ---\x1b[0m');
    const room = 'smokepvp' + Date.now().toString().slice(-6);

    await host.goto(CLIENT);
    await guest.goto(CLIENT);
    await host.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 60000, label: 'host landing ready' });

    await enterRoom(host, { room, name: 'Host', mode: 'pvp' });
    await host.waitFor(`document.body.textContent.includes('Waiting for opponent')`, { label: 'host lobby' });
    pass('host creates a PvP room and waits');

    await enterRoom(guest, { room, name: 'Guest', mode: 'join' });
    await host.waitFor(`document.body.textContent.includes('Guest')`, { label: 'host sees guest' });
    pass('both players see each other in the lobby');
    // Poll rather than read once: the two clients render the lobby independently,
    // and against a real deployment the guest can trail the host by a beat.
    check(await settles(guest, `document.body.textContent.includes('Waiting for host')`), 'the non-host is told to wait');

    await host.evaluate(`
        const btn = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.includes('Start Game'));
        if (!btn) throw new Error('no Start Game button');
        btn.click();
        return true;
    `);
    await host.waitFor(`document.body.textContent.includes('Progress')`, { label: 'host progress panel' });
    await guest.waitFor(`document.body.textContent.includes('Progress')`, { label: 'guest progress panel' });
    pass('starting the game gives both players a progress panel');

    // Both players now start from the SAME board with a shared opening already
    // revealed, so these are measured as deltas rather than against zero.
    const hostProgress = () => host.evaluate(`
        const m = document.body.textContent.match(/You:\\s*(\\d+)%/);
        return m ? parseInt(m[1], 10) : -1;
    `);
    const guestSeesHost = () => guest.evaluate(`
        const m = document.body.textContent.match(/Host:\\s*(\\d+)%/);
        return m ? parseInt(m[1], 10) : -1;
    `);

    const hostBoardAtStart = await host.evaluate(`return ${revealedCount};`);
    const guestBoardAtStart = await guest.evaluate(`return ${revealedCount};`);
    check(hostBoardAtStart > 0 && hostBoardAtStart === guestBoardAtStart,
        `both players start from the same opening (${hostBoardAtStart} cells each)`);

    const hostBefore = await hostProgress();
    const seenBefore = await guestSeesHost();

    /**
     * Opens the nth still-closed cell.
     *
     * The index matters: resetting restores the same starting board, so always
     * taking the FIRST closed cell means clicking the same square again — and if
     * that square is a mine, every attempt dies on it. One local run spent 19 of
     * 20 attempts that way. Advancing the index walks past it.
     */
    const openAClosedCell = (nth) => host.evaluate(`
        const grid = document.querySelector('[role=grid]');
        const closed = [...grid.querySelectorAll('[role=gridcell]')].filter(c => (c.getAttribute('aria-label') || '').startsWith('Unrevealed'));
        if (!closed.length) throw new Error('no closed cell to open');
        closed[${nth} % closed.length].children[1].click();
        return true;
    `);

    /** Takes the "Reset My Board" offer if the last click hit a mine. */
    const reviveIfDead = () => host.evaluate(`
        const btn = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.includes('Reset My Board'));
        if (btn) { btn.click(); return true; }
        return false;
    `);

    /*
     * Two things make a single click a bad test of progress.
     *
     * Progress is a whole percent, so one cell need not move the number: CI
     * opened 108 of 216 safe cells, exactly 50%, and 109 is still 50% rounded.
     * And a closed cell may be a mine — the client cannot tell which, by design
     * (boards are projected), so roughly a quarter of blind clicks end the
     * host's game and freeze their progress entirely.
     *
     * So: keep opening cells until the HOST's own number moves, taking the
     * reset whenever a mine ends the run. Then check the guest saw the same
     * number. Clicking once and hoping made this pass or fail on whether that
     * cell happened to cascade.
     */
    let hostAfter = hostBefore;
    let deaths = 0;
    for (let attempt = 0; attempt < 20 && hostAfter <= hostBefore; attempt++) {
        if (await reviveIfDead()) {
            deaths++;
            await sleep(400);
        }
        await openAClosedCell(attempt);
        await sleep(400);
        hostAfter = await hostProgress();
    }
    await host.waitFor(`${revealedCount} > ${hostBoardAtStart}`, { label: 'host reveals more' });
    pass("the host's move reveals more of their own board");

    check(hostAfter > hostBefore,
        `the host's own progress rises (${hostBefore}% -> ${hostAfter}%` +
            (deaths ? `, after ${deaths} mine${deaths > 1 ? 's' : ''}` : '') + ')',
        'opened cells but the percentage never moved');

    check(await settles(guest, `(() => {
        const m = document.body.textContent.match(/Host:\\s*(\\d+)%/);
        return m && parseInt(m[1], 10) === ${hostAfter};
    })()`), `the guest sees the host at ${hostAfter}% (was ${seenBefore}%)`);

    const guestBoardAfter = await guest.evaluate(`return ${revealedCount};`);
    check(guestBoardAfter === guestBoardAtStart,
        "the guest's own board is unchanged by the host's move",
        `expected ${guestBoardAtStart}, got ${guestBoardAfter}`);
}

(async () => {
    await preflight();
    const chrome = await launchChrome();

    try {
        const page = await attach(await newTarget('about:blank'));
        await coop(page);

        const host = await attach(await newTarget('about:blank'));
        const guest = await attach(await newTarget('about:blank'));
        await pvp(host, guest);

        console.log('\n\x1b[1m--- CONSOLE ---\x1b[0m');
        const errors = [...page.consoleErrors, ...host.consoleErrors, ...guest.consoleErrors]
            .filter((e) => !/favicon|404/i.test(e));
        check(errors.length === 0, 'no uncaught errors in any client', errors.slice(0, 3).join('\n        '));
    } catch (e) {
        fail('harness error', e.message);
    } finally {
        chrome.kill();
    }

    console.log(`\n${failures === 0 ? '\x1b[32mALL CHECKS PASSED\x1b[0m' : `\x1b[31m${failures} CHECK(S) FAILED\x1b[0m`}\n`);
    process.exit(failures === 0 ? 0 : 1);
})();
