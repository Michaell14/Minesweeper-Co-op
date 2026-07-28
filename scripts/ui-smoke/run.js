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

/** The board is rendered by both layout wrappers; only one is visible. */
const VISIBLE_CELLS = `
    const grids = [...document.querySelectorAll('[role=grid]')];
    const grid = grids.find(g => g.offsetParent !== null) || grids[0];
    return grid ? [...grid.querySelectorAll('[role=gridcell]')] : [];
`;
const revealedCount = `(() => {
    const grids = [...document.querySelectorAll('[role=grid]')];
    const grid = grids.find(g => g.offsetParent !== null) || grids[0];
    return [...grid.querySelectorAll('[role=gridcell]')].filter(c => !(c.getAttribute('aria-label') || '').startsWith('Unrevealed')).length;
})()`;

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
    await page.waitFor(`(() => { const g = [...document.querySelectorAll('[role=grid]')].find(x => x.offsetParent !== null); return g && g.querySelectorAll('[role=gridcell]').length === 256; })()`,
        { label: 'a 16x16 board renders' });
    pass('createRoom round-trips and the board renders');
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

    // Flagging a closed cell.
    const before = await flagsRemaining();
    await page.evaluate(`
        const grids = [...document.querySelectorAll('[role=grid]')];
        const grid = grids.find(g => g.offsetParent !== null) || grids[0];
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

    // Click a cell that is still closed, so the move actually reveals something.
    await host.evaluate(`
        const grids = [...document.querySelectorAll('[role=grid]')];
        const grid = grids.find(g => g.offsetParent !== null) || grids[0];
        const closed = [...grid.querySelectorAll('[role=gridcell]')].find(c => (c.getAttribute('aria-label') || '').startsWith('Unrevealed'));
        if (!closed) throw new Error('no closed cell to open');
        closed.children[1].click();
        return true;
    `);
    await host.waitFor(`${revealedCount} > ${hostBoardAtStart}`, { label: 'host reveals more' });
    pass("the host's move reveals more of their own board");

    check(await settles(guest, `(() => {
        const m = document.body.textContent.match(/Host:\\s*(\\d+)%/);
        return m && parseInt(m[1], 10) > ${seenBefore};
    })()`), `the guest sees the host's progress rise (from ${seenBefore}%)`);

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
