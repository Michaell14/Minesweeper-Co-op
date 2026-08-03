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
 * reset, leaving, the board-size/difficulty selectors, a two-client PVP round
 * (lobby, start, per-player boards, opponent progress), and joining via a
 * shareable room link.
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

/**
 * Ticks one radio card, addressed by its group's aria-label and its own label.
 *
 * Scoped to the group on purpose: "Medium" is both a board size and a
 * difficulty now, so a document-wide text search would pick whichever came
 * first in the DOM.
 */
const selectCard = (page, groupLabel, cardLabel) => page.evaluate(`
    const group = document.querySelector('[aria-label=${JSON.stringify(groupLabel)}]');
    if (!group) throw new Error('no ${groupLabel} group');
    const card = [...group.querySelectorAll('label')]
        .find(l => l.textContent.trim().startsWith(${JSON.stringify(cardLabel)}));
    if (!card) throw new Error('no ${cardLabel} card in ${groupLabel}');
    card.click();
    return true;
`);

/** The descriptions under one group's cards, e.g. ['10 mines', '13 mines', ...]. */
const cardNotes = (page, groupLabel) => page.evaluate(`
    const group = document.querySelector('[aria-label=${JSON.stringify(groupLabel)}]');
    return [...group.querySelectorAll('label')].map(l => l.textContent.trim());
`);

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

    // Desktop cells sit at the ceiling. The window here is 1440px, which has
    // room to spare, so anything smaller means the fit maths is measuring the
    // wrong box — the failure mode when 100cqw resolved against a container
    // that had collapsed to zero, which floors every cell instead.
    const deskCell = parseFloat(await page.evaluate(
        `return getComputedStyle(document.querySelector('[role=gridcell]')).width;`));
    const deskMax = parseFloat(await page.evaluate(
        `return getComputedStyle(document.documentElement).getPropertyValue('--ms-cell-size');`));
    check(deskCell === deskMax, `desktop cells are at the ceiling (${deskCell}px)`,
        `cell is ${deskCell}px, not the ${deskMax}px ceiling — the fit maths is measuring the wrong box`);

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

/**
 * Board size and difficulty are two selectors, and the mine count is derived
 * from the pair rather than typed anywhere.
 *
 * The co-op run above already covers the default pair (Medium/Medium is 16x16
 * with 40 mines). What is untested by that is whether changing an axis actually
 * recomputes the other's numbers and whether the derived count survives the
 * round trip into a real room — a mismatch between the card and the flag
 * counter is exactly the bug this split could introduce.
 */
async function sizeAndDifficulty(page) {
    console.log('\n\x1b[1m--- SIZE x DIFFICULTY ---\x1b[0m');
    const room = 'smokesd' + Date.now().toString().slice(-6);

    await page.goto(CLIENT);
    await page.waitFor(`!!document.querySelector('[aria-label="Select board size"]')`,
        { timeout: 60000, label: 'landing renders the size selector' });

    // At the default Medium size the difficulty row is priced for a 16x16.
    const atMedium = await cardNotes(page, 'Select game difficulty');
    check(atMedium.join('|') === 'Easy31 mines|Medium40 mines|Hard48 mines|Extreme53 mines',
        'difficulty cards show mine counts for the selected size',
        `got ${JSON.stringify(atMedium)}`);

    // Switching size must reprice difficulty, since difficulty is a density.
    await selectCard(page, 'Select board size', 'Small');
    await sleep(250);
    const atSmall = await cardNotes(page, 'Select game difficulty');
    check(atSmall.join('|') === 'Easy10 mines|Medium13 mines|Hard15 mines|Extreme17 mines',
        'changing board size reprices every difficulty',
        `got ${JSON.stringify(atSmall)}`);

    // Small + Easy is the old Easy preset: the diagonal is still reachable.
    check(atSmall[0] === 'Easy10 mines', 'Small + Easy is still the pre-split Easy (9x9, 10 mines)');

    await selectCard(page, 'Select game difficulty', 'Extreme');
    await sleep(250);

    await enterRoom(page, { room, name: 'Solo' });
    await page.waitFor(`${cellCount} >= 81`, { label: 'a 9x9 board renders' });

    const cells = await page.evaluate(`return ${cellCount};`);
    check(cells === 81 && (await page.evaluate(`return ${gridCount};`)) === 1,
        `Small builds one 9x9 board (${cells} cells)`,
        `expected 81 cells in 1 grid, got ${cells}`);

    // The derived count reaching the server is the whole point: the flag
    // counter is read back from the room the server actually created.
    const flags = await page.evaluate(`
        const el = [...document.querySelectorAll('strong')].find(e => /^\\s*-?\\d+\\s*$/.test(e.textContent));
        return el ? parseInt(el.textContent, 10) : null;
    `);
    check(flags === 17, `Small + Extreme reaches the server as 17 mines (counter shows ${flags})`,
        'the mine count derived on the client did not survive createRoom');

    await page.evaluate(`
        const btn = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.includes('Return to Home'));
        btn.click();
        return true;
    `);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"]')`, { label: 'returns to landing' });

    // Leaving resets BOTH axes, not just difficulty.
    // Scoped to the create form: the page has other radio groups (the palette
    // picker lives in the footer), and this check is about mode/size/difficulty.
    const backToDefaults = await page.evaluate(`
        const form = document.querySelector('form[aria-label="Create new room form"]');
        return [...form.querySelectorAll('input[type=radio]')].filter(r => r.checked).map(r => r.value).join(',');
    `);
    check(backToDefaults === 'co-op,Medium,Medium',
        'leaving resets size and difficulty to the defaults',
        `got "${backToDefaults}"`);
}

/**
 * The board has to fit the phone it is played on.
 *
 * This is the regression the board-first layout fixed: the default 16x16 board
 * was 571px wide on a 375px screen, so players scrolled sideways to see the
 * game, and ~420px of chrome sat above it so they scrolled down to find it
 * first. Nothing else in this suite runs at a phone viewport, so without this
 * the board could silently start overflowing again.
 */
async function mobileFit(page) {
    console.log('\n\x1b[1m--- MOBILE ---\x1b[0m');
    const room = 'smokemob' + Date.now().toString().slice(-6);

    // mobile:false is deliberate. Setting it true turns on touch emulation, and
    // the harness drives Input.dispatchMouseEvent — the clicks stop landing and
    // every room in this section times out. Only the viewport size matters here.
    await page.send('Emulation.setDeviceMetricsOverride', {
        width: 375, height: 812, deviceScaleFactor: 1, mobile: false,
    });
    await page.goto(CLIENT);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 60000, label: 'landing renders at phone width' });
    await enterRoom(page, { room, name: 'Mobile' });
    await page.waitFor(`document.querySelectorAll('[role=gridcell]').length === 256`,
        { label: 'board renders at phone width' });

    const m = JSON.parse(await page.evaluate(`
        const board = document.querySelector('[role=grid]');
        const r = board.getBoundingClientRect();
        const cell = board.querySelector('[role=gridcell]');
        const s = getComputedStyle(board);
        const px = (v) => parseFloat(v) || 0;
        const cols = px(s.getPropertyValue('--board-cols-safe'));
        const gap = px(s.getPropertyValue('--cell-gap'));
        const min = px(s.getPropertyValue('--ms-cell-min'));
        // --ms-board-inset is a calc(), and getPropertyValue hands back the
        // expression rather than a length. Measuring a throwaway element makes
        // the browser resolve it, so this tracks the token instead of a copy.
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--ms-board-inset)';
        board.appendChild(probe);
        const inset = probe.getBoundingClientRect().width;
        probe.remove();
        return JSON.stringify({
            board: Math.round(r.width),
            viewport: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            chromeAbove: Math.round(r.top + window.scrollY),
            // Unrounded on purpose — see the floor check below.
            cell: parseFloat(getComputedStyle(cell).width),
            // The scroll container the board actually has to fit inside. Not the
            // window: this excludes the page padding AND both scrollbars.
            container: board.closest('[aria-label="Game board container"]').clientWidth,
            min,
            // The exact width at which the fit maths stops beating the floor:
            // cell-fit > min iff (space - inset - (cols+1)*gap) / cols > min.
            // Same terms as the calc in board.module.css, so this is a
            // threshold rather than a guess.
            floorWidth: inset + cols * min + (cols + 1) * gap,
        });
    `));

    check(m.board <= m.viewport, `the board fits the viewport (${m.board}px in ${m.viewport}px)`,
        `board ${m.board}px overflows ${m.viewport}px`);
    // Against the CONTAINER, not the window. Both other width checks pass on a
    // board that overflows its container, because the container's own scroll
    // absorbs it and it never reaches the document — which is how a 367px board
    // in 343px of room shipped looking green.
    //
    // Unless the cells are already at --ms-cell-min: below that the board is
    // allowed to overflow and scroll, which is the whole point of the floor.
    //
    // The width is asserted to be real as well: a container that measured 0
    // satisfied "or the cells are floored" every time, so this check quietly
    // stopped meaning anything at the exact moment the layout broke.
    check(m.container > 0 && (m.board <= m.container || m.cell <= m.min),
        `the board fits its container (${m.board}px in ${m.container}px)`,
        `board ${m.board}px overflows its ${m.container}px container above the floor`);
    check(m.scrollWidth <= m.viewport, 'the page does not scroll sideways',
        `scrollWidth ${m.scrollWidth}px vs viewport ${m.viewport}px`);
    check(m.chromeAbove < 300, `the board is above the fold (${m.chromeAbove}px of chrome)`,
        `${m.chromeAbove}px of chrome above the board`);
    // Guards the fit maths from collapsing to the floor if --board-cols breaks.
    //
    // Only when there was room to do better: how much room a phone-width
    // container has left after the page padding and the platform's scrollbars
    // is not ours to decide, and CI's classic 15px bars leave less than macOS's
    // overlay ones. Floor-because-it-genuinely-does-not-fit is correct
    // behaviour; floor-with-room-to-spare is the broken calc this is here for.
    //
    // Compared unrounded either way: sixteen columns work out at 18.31px on a
    // 375px phone, and rounding that to 18 is indistinguishable from the clamp
    // bottoming out.
    const hasRoom = m.container > m.floorWidth;
    check(m.cell > m.min || !hasRoom,
        `cells are sized to fit, not floored (${m.cell.toFixed(2)}px in ${m.container}px)`,
        `cell is ${m.cell}px, i.e. at --ms-cell-min, with ${m.container}px to fit ${m.floorWidth}px`);

    await page.send('Emulation.clearDeviceMetricsOverride');
}


/**
 * The floating footer icons must never sit over the board.
 *
 * Absolutely positioned, the cluster anchors to the FIRST VIEWPORT of the
 * document — which at ~1300px widths with a wide board is exactly where the
 * bottom-right cells are, and an icon over a cell is a cell nobody can click.
 * The fix keeps floating for the landing page only; with a game mounted the
 * cluster joins normal flow below the board. Reproduced here at the worst
 * case this repo can produce: a 1320px viewport with large cells, which
 * pushes the board's right edge well under where the icons used to float.
 */
async function footerClearance(page) {
    console.log('\n\x1b[1m--- FOOTER CLEARANCE ---\x1b[0m');
    const room = 'smokeftr' + Date.now().toString().slice(-6);

    await page.send('Emulation.setDeviceMetricsOverride', {
        width: 1320, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await page.goto(CLIENT);
    // Large cells widen a 16-wide board to ~900px — into the icons' corner.
    // The session is cleared too: the previous section left its room joined,
    // and the resume offer would put this page straight back into it instead
    // of on the landing form.
    await page.evaluate(`
        sessionStorage.clear();
        localStorage.setItem('minesweeper_settings', JSON.stringify({ version: 1, cellSize: 'large' }));
    `);
    await page.goto(CLIENT); // reload so hydration reads the blob
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 60000, label: 'landing renders at 1320px' });
    await enterRoom(page, { room, name: 'Clearance' });
    await page.waitFor(`document.querySelectorAll('[role=gridcell]').length === 256`,
        { label: 'board renders with large cells' });

    const m = JSON.parse(await page.evaluate(`
        const board = document.querySelector('[role=grid]').getBoundingClientRect();
        const github = document.querySelector('a[aria-label="View this project on GitHub"]');
        const cluster = github && github.parentElement.getBoundingClientRect();
        const overlaps = cluster && !(
            cluster.right <= board.left || cluster.left >= board.right ||
            cluster.bottom <= board.top || cluster.top >= board.bottom
        );
        return JSON.stringify({ present: !!cluster, overlaps: !!overlaps });
    `));
    check(m.present, 'the footer icons still exist during a game');
    check(!m.overlaps, 'the footer icons do not cover the board',
        'the icon cluster intersects the board rect — cells behind it cannot be clicked');

    await page.evaluate(`localStorage.removeItem('minesweeper_settings');`);
    await page.send('Emulation.clearDeviceMetricsOverride');
}

/**
 * A reload must not cost you your game — and must not drag you back into one
 * you walked out of.
 *
 * Both halves matter and they pull in opposite directions, which is exactly why
 * this is worth a browser check. Server-side they are indistinguishable: a
 * deliberate leave and a dropped connection reach the same `removePlayer`. The
 * only thing separating them is that leaving clears the room from the session,
 * and nothing but an end-to-end reload proves that still holds.
 */
async function rejoinOnReload(page) {
    console.log('\n\x1b[1m--- REJOIN ---\x1b[0m');
    const room = 'smokejoin' + Date.now().toString().slice(-6);

    /*
     * Start from the landing page, whatever the previous section left behind.
     * This is not defensive noise: with resume in place, a tab that ended inside
     * a room now lands straight back in it, so `goto` alone no longer guarantees
     * a create form. That is the feature working, and this section has to arm
     * itself rather than inherit a clean slate from whoever ran before it.
     */
    await page.goto(CLIENT);
    await sleep(1500);
    await page.evaluate(`
        const leave = [...document.querySelectorAll('button')]
            .find(b => /Return to Home/i.test(b.textContent));
        if (leave) leave.click();
        return true;
    `);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 60000, label: 'landing renders' });
    await enterRoom(page, { room, name: 'Reloader' });
    await page.waitFor(`${cellCount} === 256`, { label: 'board renders before the reload' });

    // Open a cascade, so the restored board has something to be wrong about.
    await page.evaluate(`
        const cells = [...document.querySelectorAll('[role=gridcell]')];
        const inner = [...cells[8 * 16 + 8].children].find(d => d.offsetParent !== null);
        inner.click();
        return true;
    `);
    await page.waitFor(`${revealedCount} > 1`, { label: 'a cascade opens' });
    const openedBefore = await page.evaluate(`return ${revealedCount};`);

    await page.goto(CLIENT);
    await page.waitFor(`${cellCount} === 256`, { timeout: 30000, label: 'the reload lands back in the room' });
    pass('a reload puts the player back in their room');

    const openedAfter = await page.evaluate(`return ${revealedCount};`);
    check(openedAfter === openedBefore,
        `the board comes back as it was (${openedAfter} cells open)`,
        `had ${openedBefore} open before the reload, ${openedAfter} after`);

    const clock = await page.evaluate(`
        const t = document.querySelector('[role=timer]');
        return t ? t.getAttribute('aria-label') : 'no timer';
    `);
    check(/^Elapsed time/.test(clock), `the clock survives the reload (${clock})`,
        `timer read "${clock}"`);

    // The other half: leaving on purpose must NOT be resumed.
    await page.evaluate(`
        const leave = [...document.querySelectorAll('button')]
            .find(b => /Return to Home/i.test(b.textContent));
        if (!leave) throw new Error('no leave button');
        leave.click();
        return true;
    `);
    await page.waitFor(`${cellCount} === 0`, { label: 'leaving returns to the landing page' });

    await page.goto(CLIENT);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 30000, label: 'landing renders after the second reload' });
    await sleep(1500); // Give a resume, if one were wrongly offered, time to land.
    check(await page.evaluate(`return ${cellCount};`) === 0,
        'leaving on purpose is not undone by a reload',
        'a reload dragged the player back into the room they left');
}

/**
 * Every palette, measured against WCAG AA in a real browser.
 *
 * This is the check that cannot be done anywhere else. Contrast depends on what
 * the browser actually painted, and a theme overrides only the palette layer —
 * so a semantic token can pass on one palette and fail on another with nothing
 * in the source changing. `dark` in particular deliberately KEEPS the NES
 * accent hues while inverting the surfaces, which is exactly the arrangement
 * that once shipped white-on-yellow at 1.16:1.
 *
 * Screenshot diffing would be the other way to do this and would be worse: dev
 * is macOS, CI is Linux, and the font rasterises differently on each, so the
 * baselines would be permanently red for reasons unrelated to the design
 * system. Resolved colours are exact on both.
 *
 * ## Why this is a ratchet and not a pass/fail
 *
 * The two most restricted palettes cannot meet AA everywhere and still be what
 * they are. Game Boy is four shades of green; eight distinguishable cell
 * numbers at 4.5:1 do not exist inside it. C64 has the same problem across its
 * sixteen. `app/ds/contrast.ts` says as much in its own header — a restricted
 * retro palette makes this failure easy.
 *
 * So the known failures are listed below rather than fixed, and this asserts
 * that the set does not GROW. A new failure, or one theme's failure appearing
 * in another, fails the suite; the existing ones are printed every run so the
 * debt is visible in CI rather than only to whoever opens /ds. Removing an
 * entry here is the reward for improving a palette.
 */
const KNOWN_CONTRAST_FAILURES = {
    __default__: [],
    gameboy: [
        'muted text on panel',
        'primary button',
        'cell number 1',
        'cell number 2',
        'cell number 3',
    ],
    c64: [
        'muted text on panel',
        'cell number 1',
        'cell number 2',
        'cell number 3',
        'cell number 5',
        'cell number 6',
        'cell number 7',
        'cell number 8',
    ],
    dark: [],
    amber: [],
    // Two reds, and no ink clears AA on both. See the theme block in tokens.css.
    spectrum: ['error button'],
    contrast: [],
    synthwave: [],
};

async function themeContrast(page) {
    console.log('\n\x1b[1m--- THEMES ---\x1b[0m');

    await page.goto(`${CLIENT}/ds`);
    await page.waitFor(`!!document.querySelector('[aria-label="Preview palette"]')`,
        { timeout: 60000, label: 'the catalog renders' });

    const themes = JSON.parse(await page.evaluate(`
        const group = document.querySelector('[aria-label="Preview palette"]');
        return JSON.stringify([...group.querySelectorAll('input[type=radio]')].map(i => i.value));
    `));
    check(themes.length === Object.keys(KNOWN_CONTRAST_FAILURES).length,
        `every palette is audited (${themes.length})`,
        `found ${themes.length} palettes but ${Object.keys(KNOWN_CONTRAST_FAILURES).length} are listed above`);

    for (const theme of themes) {
        await page.evaluate(`
            const group = document.querySelector('[aria-label="Preview palette"]');
            [...group.querySelectorAll('input[type=radio]')].find(i => i.value === ${JSON.stringify(theme)}).click();
            return true;
        `);
        /*
         * The report re-measures in an effect keyed on the theme, and stamps
         * the palette it measured on the container when it commits. Waiting for
         * that rather than sleeping is the difference between a check and a
         * coin toss: a read that lands early sees the PREVIOUS palette's rows,
         * finds no new failures in them, and passes — which is the exact false
         * pass this ratchet exists to catch.
         */
        await page.waitFor(
            `document.querySelector('[data-audited-theme]')?.dataset.auditedTheme === ${JSON.stringify(theme)}`,
            { label: `${theme} audit re-measures` });

        // Each row is <p><span>{label}</span><span>{ratio} (needs N)</span></p>;
        // only a FAILING row carries the "(needs N)" suffix. Scoped to the
        // report so no other <p> on the catalog can be read as a row.
        const failing = JSON.parse(await page.evaluate(`
            const report = document.querySelector('[data-audited-theme]');
            const rows = [...report.querySelectorAll('p')].filter(el =>
                el.children.length === 2 &&
                /needs [0-9]/.test(el.children[1].textContent));
            return JSON.stringify(rows.map(el => el.children[0].textContent.trim()));
        `));

        const known = KNOWN_CONTRAST_FAILURES[theme] || [];
        const regressions = failing.filter((f) => !known.includes(f));
        const fixed = known.filter((k) => !failing.includes(k));

        // The label prints above the failure detail either way, so it states
        // what was measured rather than a verdict that would read as a lie on a
        // failing run.
        const summary = failing.length === 0
            ? `${theme}: every audited pair meets AA`
            : `${theme}: ${failing.length} failing (${failing.join(', ')})`;
        check(regressions.length === 0, summary,
            `${theme}: NEW contrast failure(s) not in KNOWN_CONTRAST_FAILURES — ${regressions.join(', ')}`);

        if (fixed.length) {
            console.log(`  \x1b[36mNOTE\x1b[0m  ${theme}: now passing, remove from KNOWN_CONTRAST_FAILURES — ${fixed.join(', ')}`);
        }
    }
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

    /*
     * Reloading mid-race.
     *
     * Two things have to hold and neither is visible in a screenshot. The
     * reloader must not FORFEIT — a disconnect and a refresh look identical to
     * the server, and the win used to be handed over instantly. And the board
     * they come back to must actually be playable: the room addresses each
     * racer's board by socket id, so a returning player whose slot was not
     * repointed gets their board back and every click on it is ignored, with one
     * line in the server log and nothing at all on screen.
     */
    await guest.goto(CLIENT);
    await guest.waitFor(`${cellCount} === 256`, { timeout: 30000, label: 'the reload lands back in the race' });
    pass('a reload puts the racer back in their race');

    check(await guest.evaluate(`return ${revealedCount};`) === guestBoardAfter,
        `the racer's own board comes back as it was (${guestBoardAfter} cells open)`,
        'the restored board does not match what they left');

    check(!(await guest.evaluate(`return !!document.getElementById('dialog-pvp-opponent-won')?.open;`)),
        'reloading does not forfeit the race',
        'the reloader was told their opponent won');

    const beforeClick = await guest.evaluate(`return ${revealedCount};`);
    await guest.evaluate(`
        const closed = [...document.querySelectorAll('[role=gridcell]')]
            .filter(c => (c.getAttribute('aria-label') || '').startsWith('Unrevealed'));
        const inner = [...closed[0].children].find(d => d.offsetParent !== null);
        inner.click();
        return true;
    `);
    check(await settles(guest, `${revealedCount} !== ${beforeClick}`),
        'the restored board still responds to clicks',
        'the board came back but ignores every click — the slot was not repointed');
}

/**
 * A join link (?room=...) pre-fills the room code and jumps straight to the
 * name dialog, rather than making the guest type the code in by hand.
 */
async function joinLink(host, guest) {
    console.log('\n\x1b[1m--- JOIN LINK ---\x1b[0m');
    const room = 'smokelink' + Date.now().toString().slice(-6);

    await host.goto(CLIENT);
    await host.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 60000, label: 'host landing ready' });
    await enterRoom(host, { room, name: 'Host' });
    await host.waitFor(`${cellCount} >= 256`, { label: 'host board renders' });
    pass('host creates the room to share');

    await guest.goto(`${CLIENT}/?room=${encodeURIComponent(room)}`);
    await guest.waitFor(`document.getElementById('dialog-name-join')?.open`,
        { timeout: 60000, label: 'join link auto-opens the name dialog' });
    pass('opening a join link auto-opens the name dialog');

    const prefilled = await guest.evaluate(`
        return document.querySelector('form[aria-label="Join existing room form"] input')?.value;
    `);
    check(prefilled === room, `the room code is pre-filled (got "${prefilled}")`);

    await guest.type('#dialog-name-join input[name="name"]', 'Guest');
    await guest.click('#dialog-name-join button[type=submit]');
    await guest.waitFor(`${cellCount} >= 256`, { label: 'guest board renders after joining via link' });
    check(await guest.evaluate(`return document.body.textContent.includes(${JSON.stringify(room)});`),
        'guest lands in the shared room');

    await host.waitFor(`document.body.textContent.includes('Guest')`, { label: 'host sees guest join' });
    pass('the host sees the guest join via the link');
}

(async () => {
    await preflight();
    const chrome = await launchChrome();

    try {
        const page = await attach(await newTarget('about:blank'));
        await coop(page);
        await sizeAndDifficulty(page);
        await mobileFit(page);
        await footerClearance(page);
        await rejoinOnReload(page);
        await themeContrast(page);

        const host = await attach(await newTarget('about:blank'));
        const guest = await attach(await newTarget('about:blank'));
        await pvp(host, guest);

        const linkHost = await attach(await newTarget('about:blank'));
        const linkGuest = await attach(await newTarget('about:blank'));
        await joinLink(linkHost, linkGuest);

        console.log('\n\x1b[1m--- CONSOLE ---\x1b[0m');
        const errors = [...page.consoleErrors, ...host.consoleErrors, ...guest.consoleErrors,
            ...linkHost.consoleErrors, ...linkGuest.consoleErrors]
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
