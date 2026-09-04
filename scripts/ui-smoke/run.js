#!/usr/bin/env node
/**
 * End-to-end UI smoke test: drives the real client in headless Chrome against
 * a local backend (`npm run dev:all` first, then `npm run test:ui`). Run it
 * after touching app/, components/ or hooks/. Covers room creation, the first
 * click cascade, flagging, reset, leaving, the size/difficulty selectors, a
 * two-client PVP round, join links and keyboard play. NOT chording: a browser
 * client cannot see the mines, so that is tested against the server.
 */
const { launchChrome, attach, newTarget, sleep } = require('./cdp');

const CLIENT = process.env.UI_SMOKE_CLIENT || 'http://localhost:3000';
const SERVER = process.env.UI_SMOKE_SERVER || 'http://localhost:3001';

let failures = 0;
const pass = (label) => console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
const fail = (label, detail) => { failures++; console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? '\n        ' + detail : ''}`); };
const check = (condition, label, detail) => (condition ? pass(label) : fail(label, detail));

/** Waits for an expression and reports whether it held, instead of throwing; for a lagging second client. */
const settles = (page, expression, timeout = 8000) =>
    page.waitFor(expression, { timeout }).then(() => true).catch(() => false);

/** Exactly one board in the DOM; `gridCount` below asserts it stays that way. */
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
 * Ticks one radio card by its group's aria-label and its own label. Scoped to
 * the group: "Medium" is both a size and a difficulty.
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
    // The profile outlives the run; a leaked large-cell preference would break the ceiling check below.
    await page.evaluate(`localStorage.removeItem('minesweeper_settings'); return true;`);
    await page.goto(CLIENT);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { label: 'landing renders on the default settings' });
    pass('landing renders the create-room form');

    await enterRoom(page, { room, name: 'Alice' });
    // `>=` so a duplicated board fails the count check below instead of timing out here.
    await page.waitFor(`${cellCount} >= 256`, { label: 'a 16x16 board renders' });
    pass('createRoom round-trips and the board renders');

    // One board, not one per layout; only the cell count gives a duplicate away.
    check(await page.evaluate(`return ${gridCount};`) === 1 && await page.evaluate(`return ${cellCount};`) === 256,
        'the board is mounted once (1 grid, 256 cells)',
        `got ${await page.evaluate(`return ${gridCount};`)} grids and ${await page.evaluate(`return ${cellCount};`)} cells; ` +
        'a second copy means Grid.tsx is rendering the board per layout again');
    check(await page.evaluate(`return document.body.textContent.includes(${JSON.stringify(room)});`), 'room code is displayed');

    /*
     * The board fits the window it is given. The clamp now answers both axes
     * (components/game/board.module.css) and at 1440x900 the height half binds,
     * so the ceiling is no longer the invariant; what is asserted is the range,
     * and the floor: cells at --ms-cell-min means the fit measured a zero box.
     */
    const deskCell = parseFloat(await page.evaluate(
        `return getComputedStyle(document.querySelector('[role=gridcell]')).width;`));
    // From the GRID: the cell-size setting overrides --ms-cell-size on .gameBoard, not the root.
    const deskMax = parseFloat(await page.evaluate(
        `return getComputedStyle(document.querySelector('[role=grid]')).getPropertyValue('--ms-cell-size');`));
    const deskMin = parseFloat(await page.evaluate(
        `return getComputedStyle(document.querySelector('[role=grid]')).getPropertyValue('--ms-cell-min');`));
    check(deskCell > deskMin && deskCell <= deskMax,
        `desktop cells are sized by the fit, not floored (${deskCell}px)`,
        `cell is ${deskCell}px, outside (${deskMin}, ${deskMax}] — the fit maths is measuring the wrong box`);

    /*
     * Absolute offsets: getBoundingClientRect is relative to the SCROLL position,
     * and entering a room leaves this page scrolled down.
     */
    const boardFit = JSON.parse(await page.evaluate(`
        const r = document.querySelector('[role=grid]').getBoundingClientRect();
        return JSON.stringify({
            top: Math.round(r.top + window.scrollY),
            height: Math.round(r.height),
            viewport: window.innerHeight,
        });
    `));
    check(boardFit.top >= 0 && boardFit.top + boardFit.height <= boardFit.viewport,
        `the whole board is on screen without scrolling (${boardFit.top + boardFit.height}px of ${boardFit.viewport}px)`,
        `the board spans ${boardFit.top}-${boardFit.top + boardFit.height}px in a ${boardFit.viewport}px viewport — `
        + '--ms-board-reserve no longer covers the chrome above it');

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

    // A point per cell opened, so a cascade of N scores N; the leaderboard shows a regression.
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
    /*
     * The flag is pixel art (components/ds/sprites.tsx): a <use> pointing at a
     * <symbol> in the layout. A renamed id paints an empty cell, so the art is
     * measured rather than the element counted.
     */
    const flagSprite = JSON.parse(await page.evaluate(`
        const grid = document.querySelector('[role=grid]');
        const flagged = [...grid.querySelectorAll('[role=gridcell]')].find(c => (c.getAttribute('aria-label') || '').startsWith('Flagged'));
        if (!flagged) return JSON.stringify(null);
        const use = flagged.querySelector('use');
        const art = use && document.querySelector(use.getAttribute('href'));
        const svg = flagged.querySelector('svg');
        const box = svg && svg.getBoundingClientRect();
        return JSON.stringify({
            href: use && use.getAttribute('href'),
            rects: art ? art.querySelectorAll('rect').length : 0,
            hits: svg && getComputedStyle(svg).pointerEvents,
            width: box ? Math.round(box.width) : 0,
        });
    `));
    check(flagSprite && flagSprite.rects > 4,
        `the flag sprite renders on the board (${flagSprite && flagSprite.rects} rects via ${flagSprite && flagSprite.href})`,
        `the <use> resolved to no art: ${JSON.stringify(flagSprite)}`);
    check(flagSprite && flagSprite.width > 8,
        `the sprite is drawn at a usable size (${flagSprite && flagSprite.width}px)`,
        `sprite measured ${flagSprite && flagSprite.width}px — an svg with no CSS size collapses`);
    // A sprite that takes clicks is a flag that cannot be removed by tapping it.
    check(flagSprite && flagSprite.hits === 'none',
        'the sprite lets clicks through to the cell',
        `pointer-events: ${flagSprite && flagSprite.hits}`);

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

    /*
     * Back leaves the ROOM, not the site (hooks/useRoomHistory.ts). Only a real
     * session history can prove it, so it is here rather than in jsdom.
     * Fired on a timer so this evaluate returns BEFORE the navigation: called
     * inline, a cross-document back() tears down the execution context and CDP
     * answers "Inspected target navigated or closed".
     */
    await page.evaluate(`setTimeout(() => window.history.back(), 0); return true;`);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"]')`,
        { label: 'Back returns to the landing page' });
    pass('the browser Back button leaves the room, not the site');

    // A real leave takes the board down; a landing page over a joined room would pass the check above.
    check(await page.evaluate(`return ${gridCount};`) === 0,
        'Back tore the board down too',
        'the landing form is showing but the board is still mounted');

    // Rejoin for the button's own path, which routes through the same entry.
    await enterRoom(page, { room, name: 'Alice', mode: 'join' });
    await page.waitFor(`${cellCount} >= 256`, { label: 'rejoined the room' });

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
 * Size and difficulty are two selectors and the mine count is derived. Co-op
 * covers the default pair; this checks that changing one axis reprices the
 * other and that the derived count survives the round trip into a real room.
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

    // The flag counter is read back from the room the server actually created.
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

    // Leaving resets BOTH axes. Scoped to the create form: the page has other radio groups.
    const backToDefaults = await page.evaluate(`
        const form = document.querySelector('form[aria-label="Create new room form"]');
        return [...form.querySelectorAll('input[type=radio]')].filter(r => r.checked).map(r => r.value).join(',');
    `);
    check(backToDefaults === 'co-op,Medium,Medium',
        'leaving resets size and difficulty to the defaults',
        `got "${backToDefaults}"`);
}

/**
 * The desktop layout has to fit the width it switches ON at: `xl:` is 1280px
 * and the arrangement once wanted ~1307. Run at the breakpoint, where the
 * margin is smallest; a board that fits by shrinking its cells is not fixed.
 * The HUD's position is only observable here (jsdom has no layout). A 17px
 * scrollbar is forced so every machine measures the same worst case: `xl:`
 * matches on the window, which counts the scrollbar, but the row lays out in
 * what is left.
 */
async function desktopFit(page) {
    console.log('\n\x1b[1m--- DESKTOP FIT ---\x1b[0m');
    const room = 'smokedesk' + Date.now().toString().slice(-6);

    // 1000 tall, not 900: at 900 the height half of the clamp binds first. Height is covered in CO-OP.
    await page.send('Emulation.setDeviceMetricsOverride', {
        width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
    // Resume would put this page back in the previous room; the settings blob outlives the run too.
    await page.goto(CLIENT);
    await page.evaluate(`sessionStorage.clear(); localStorage.removeItem('minesweeper_settings'); return true;`);
    await page.goto(CLIENT);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 60000, label: 'landing renders at 1280px' });
    await enterRoom(page, { room, name: 'Desk' });
    await page.waitFor(`document.querySelectorAll('[role=gridcell]').length === 256`,
        { label: 'board renders at 1280px' });

    // Styling ::-webkit-scrollbar opts out of overlay scrollbars, so it takes width.
    await page.evaluate(`
        const s = document.createElement('style');
        s.id = 'smoke-classic-scrollbar';
        s.textContent = 'html::-webkit-scrollbar{width:17px} html{overflow-y:scroll}';
        document.head.appendChild(s);
        return true;
    `);
    await sleep(300);

    const m = JSON.parse(await page.evaluate(`
        const doc = document.documentElement;
        const grid = document.querySelector('[role=grid]');
        const board = grid.getBoundingClientRect();
        const visible = (sel) => [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null);
        const clock = visible('[role=timer]').getBoundingClientRect();
        return JSON.stringify({
            viewport: doc.clientWidth,
            scrollbar: window.innerWidth - doc.clientWidth,
            scrollWidth: doc.scrollWidth,
            board: Math.round(board.width),
            container: grid.closest('[aria-label="Game board container"]').clientWidth,
            cell: parseFloat(getComputedStyle(grid.querySelector('[role=gridcell]')).width),
            ceiling: parseFloat(getComputedStyle(grid).getPropertyValue('--ms-cell-size')),
            // Above the board, and inside its width: a rail fails both.
            clockOnBoardEdge: clock.bottom <= board.top
                && clock.left >= board.left - 1 && clock.right <= board.right + 1,
        });
    `));

    // Without it the checks below silently revert to the easy 1280px case.
    check(m.scrollbar === 17, `the classic scrollbar is in force (${m.scrollbar}px, leaving ${m.viewport}px)`,
        `expected a 17px scrollbar, got ${m.scrollbar}px — the checks below prove nothing`);
    check(m.scrollWidth <= m.viewport, `the game does not scroll sideways at ${m.viewport}px`,
        `scrollWidth ${m.scrollWidth}px vs viewport ${m.viewport}px — the rails do not fit beside the board`);
    check(m.board <= m.container, `the board fits its column (${m.board}px in ${m.container}px)`,
        `board ${m.board}px overflows its ${m.container}px column`);
    check(m.cell === m.ceiling, `cells are still at the ceiling at the breakpoint (${m.cell}px)`,
        `cell is ${m.cell}px, not ${m.ceiling}px — the board column is ${m.container}px and wants 707px, `
        + 'so the gap either side of it is taking room the board needs');
    check(m.clockOnBoardEdge, "the clock sits on the board's top edge",
        "the timer is not within the board's width above it — the HUD has drifted back out to a side rail");

    // Leave, or the next section inherits a board: only leaving clears the room from the session.
    await page.evaluate(`
        document.getElementById('smoke-classic-scrollbar')?.remove();
        const btn = [...document.querySelectorAll('button')]
            .find((b) => b.offsetParent !== null && b.textContent.includes('Return to Home'));
        btn.click();
        return true;
    `);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"]')`,
        { label: 'returns to landing' });

    await page.send('Emulation.clearDeviceMetricsOverride');
}

/**
 * The board has to fit the phone it is played on: the default 16x16 was once
 * 571px wide on a 375px screen under ~420px of chrome. Nothing else here runs
 * at a phone viewport.
 */
async function mobileFit(page) {
    console.log('\n\x1b[1m--- MOBILE ---\x1b[0m');
    const room = 'smokemob' + Date.now().toString().slice(-6);

    // mobile:false: touch emulation would stop Input.dispatchMouseEvent clicks landing.
    await page.send('Emulation.setDeviceMetricsOverride', {
        width: 375, height: 812, deviceScaleFactor: 1, mobile: false,
    });
    await page.goto(CLIENT);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 60000, label: 'landing renders at phone width' });

    /*
     * Nothing may overflow the DOCUMENT on the landing page: on a real phone
     * Chrome widens the layout viewport to cover it and every `position: fixed`
     * element centres on that. Measured against the BODY, not innerWidth: with
     * `mobile: false` the widening itself cannot be reproduced here, only the
     * overflow under it. Before the room, because the cards are a landing control.
     */
    const landing = JSON.parse(await page.evaluate(`
        return JSON.stringify({
            body: document.body.clientWidth,
            docScroll: document.documentElement.scrollWidth,
            widest: [...document.querySelectorAll('body *')]
                .filter((e) => e.getBoundingClientRect().right > document.body.clientWidth)
                .map((e) => e.tagName + '.' + String(e.className).slice(0, 30))
                .slice(0, 3),
        });
    `));
    check(landing.docScroll <= landing.body,
        `the landing page does not overflow the document (${landing.body}px)`,
        `documentElement scrolls to ${landing.docScroll}px in a ${landing.body}px body`
        + (landing.widest.length ? ` — past the edge: ${landing.widest.join(', ')}` : ''));

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
    // Against the CONTAINER, not the window: its own scroll absorbs an overflow
    // before it reaches the document. Unless the cells are already at
    // --ms-cell-min, where overflow is the floor's point. The width must be real
    // too: a container measuring 0 satisfied "or floored" every time.
    check(m.container > 0 && (m.board <= m.container || m.cell <= m.min),
        `the board fits its container (${m.board}px in ${m.container}px)`,
        `board ${m.board}px overflows its ${m.container}px container above the floor`);
    check(m.scrollWidth <= m.viewport, 'the page does not scroll sideways',
        `scrollWidth ${m.scrollWidth}px vs viewport ${m.viewport}px`);
    check(m.chromeAbove < 300, `the board is above the fold (${m.chromeAbove}px of chrome)`,
        `${m.chromeAbove}px of chrome above the board`);
    // Guards the fit maths from collapsing to the floor if --board-cols breaks,
    // but only when there was room to do better: CI's classic scrollbars leave
    // less than macOS's overlay ones. Compared unrounded: 18.31px rounds to 18,
    // indistinguishable from the clamp bottoming out.
    const hasRoom = m.container > m.floorWidth;
    check(m.cell > m.min || !hasRoom,
        `cells are sized to fit, not floored (${m.cell.toFixed(2)}px in ${m.container}px)`,
        `cell is ${m.cell}px, i.e. at --ms-cell-min, with ${m.container}px to fit ${m.floorWidth}px`);

    await page.send('Emulation.clearDeviceMetricsOverride');
}


/**
 * Site navigation must never sit over the board. This replaced icons floated
 * over the bottom-right, which landed on cells at ~1300px with a wide board.
 * Held at the worst case the repo can produce (1320px, large cells).
 */
async function headerClearance(page) {
    console.log('\n\x1b[1m--- HEADER CLEARANCE ---\x1b[0m');
    const room = 'smokeftr' + Date.now().toString().slice(-6);

    await page.send('Emulation.setDeviceMetricsOverride', {
        width: 1320, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await page.goto(CLIENT);
    // Large cells widen a 16-wide board to ~900px. Session cleared too, or
    // resume would skip the landing form.
    await page.evaluate(`
        sessionStorage.clear();
        localStorage.setItem('minesweeper_settings', JSON.stringify({ version: 1, cellSize: 'large' }));
    `);
    await page.goto(CLIENT); // reload so hydration reads the blob
    // The removal must run even if a wait times out: the profile is reused across runs.
    try {
        await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
            { timeout: 60000, label: 'landing renders at 1320px' });
        await enterRoom(page, { room, name: 'Clearance' });
        await page.waitFor(`document.querySelectorAll('[role=gridcell]').length === 256`,
            { label: 'board renders with large cells' });

        const m = JSON.parse(await page.evaluate(`
            const board = document.querySelector('[role=grid]').getBoundingClientRect();
            const nav = document.querySelector('nav[aria-label="Main"]');
            const rect = nav && nav.getBoundingClientRect();
            const overlaps = rect && !(
                rect.right <= board.left || rect.left >= board.right ||
                rect.bottom <= board.top || rect.top >= board.bottom
            );
            const drills = !!(nav && nav.querySelector('a[href="/drills"]'));
            return JSON.stringify({
                present: !!rect, overlaps: !!overlaps, drills,
                viewport: document.documentElement.clientWidth,
                scrollWidth: document.documentElement.scrollWidth,
            });
        `));
        check(m.present, 'the header is still there during a game');
        check(m.drills, 'the header still reaches the content pages during a game');
        check(!m.overlaps, 'the header does not cover the board',
            'the header intersects the board rect — cells behind it cannot be clicked');
        // The widest board the app can produce also has to fit beside the rails.
        check(m.scrollWidth <= m.viewport, `large cells do not scroll the page sideways (${m.viewport}px)`,
            `scrollWidth ${m.scrollWidth}px vs viewport ${m.viewport}px with large cells`);
    } finally {
        // Swallowed: a cleanup that throws here would replace the real failure.
        await page.evaluate(`localStorage.removeItem('minesweeper_settings');`).catch(() => {});
    }
    await page.send('Emulation.clearDeviceMetricsOverride');
}

/**
 * A reload must not cost you your game, and must not drag you back into one
 * you left. Server-side the two are the same `removePlayer`; only leaving
 * clears the room from the session, and only a real reload proves that.
 */
async function rejoinOnReload(page) {
    console.log('\n\x1b[1m--- REJOIN ---\x1b[0m');
    const room = 'smokejoin' + Date.now().toString().slice(-6);

    /*
     * Start from the landing page whatever the previous section left: with
     * resume in place a tab that ended inside a room lands straight back in it.
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

    /*
     * The score before and after. Player records are keyed by socket id, so a
     * rejoin creates a new one; the score once came back as 0. Server side is
     * server/tests/reconnectScore.test.js.
     */
    const scoreOnBoard = () => page.evaluate(`
        const table = [...document.querySelectorAll('table')].find(t => t.offsetParent !== null);
        const row = table && table.querySelector('tbody tr');
        return row ? parseInt(row.cells[1].textContent, 10) : null;
    `);
    const scoreBefore = await scoreOnBoard();
    check(scoreBefore > 0, `there is a score to lose (${scoreBefore})`,
        'the cascade scored nothing, so the reload check below would prove nothing');

    await page.goto(CLIENT);
    await page.waitFor(`${cellCount} === 256`, { timeout: 30000, label: 'the reload lands back in the room' });
    pass('a reload puts the player back in their room');

    const scoreAfter = await scoreOnBoard();
    check(scoreAfter === scoreBefore,
        `the score survives the reload (${scoreAfter})`,
        `had ${scoreBefore} before the reload and ${scoreAfter} after — the rejoin built a fresh player record and dropped the score`);

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
 * Every palette against WCAG AA in a real browser: contrast depends on what
 * was painted, and a theme overrides only the palette layer, so a semantic
 * token can pass on one palette and fail on another. Not screenshot diffing:
 * fonts rasterise differently on macOS and Linux.
 *
 * A ratchet, not a pass/fail: Game Boy and C64 cannot meet AA everywhere and
 * still be themselves, so the known failures are listed and the set must not
 * GROW. Fixing one prints a note to delete the entry.
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
    tetris: [],
    pacman: [],
    minecraft: [],
    mario: [],
    // Seasonal, audited year-round: /ds offers every palette whatever the date.
    halloween: [],
    christmas: [],
    'lunar-new-year': [],
    valentines: [],
    thanksgiving: [],
    stpatricks: [],
    pride: [],
    'day-of-the-dead': [],
    newyear: [],
};

/*
 * The palette cards read tokens.css out of the CSSOM, not the cascade, so a
 * Game Boy card shows Game Boy green on an NES page. Reading computed style
 * would give every card the same colours, so the load-bearing check is that
 * the cards DIFFER. Only a real browser has a stylesheet to walk.
 */
async function themeSwatches(page) {
    console.log('\n\x1b[1m--- THEME SWATCHES ---\x1b[0m');

    await page.goto(`${CLIENT}/settings`);
    await page.waitFor(`!!document.querySelector('[aria-label="Colour palette"]')`,
        { timeout: 60000, label: 'the palette cards render' });
    // They arrive in an effect after mount, so waiting on the group is not enough.
    await page.waitFor(`document.querySelectorAll('[data-swatch]').length > 0`,
        { label: 'the swatches resolve' });

    const cards = JSON.parse(await page.evaluate(`
        const group = document.querySelector('[aria-label="Colour palette"]');
        return JSON.stringify([...group.querySelectorAll('label')].map((card) => ({
            value: card.querySelector('input[type=radio]').value,
            swatches: [...card.querySelectorAll('[data-swatch]')]
                .map((s) => getComputedStyle(s).backgroundColor),
        })));
    `));

    check(cards.length > 0, `every palette card carries swatches (${cards.length} cards)`,
        'no palette cards found');

    const wrong = cards.filter((c) => c.swatches.length !== 5);
    check(wrong.length === 0, `each card shows all five swatches`,
        `cards with the wrong count: ${wrong.map((c) => `${c.value}:${c.swatches.length}`).join(', ')}`);

    // A colour that failed to resolve paints transparent, not an error.
    const blank = cards.filter((c) =>
        c.swatches.some((s) => !s || s === 'rgba(0, 0, 0, 0)' || s === 'transparent'));
    check(blank.length === 0, 'no swatch resolved to transparent',
        `cards with an unresolved swatch: ${blank.map((c) => c.value).join(', ')}`);

    // The whole point: identical rows would mean the swatches read the APPLIED palette.
    const byValue = Object.fromEntries(cards.map((c) => [c.value, c.swatches.join('|')]));
    const distinct = new Set(Object.values(byValue));
    check(distinct.size > 1,
        `cards show different palettes from one another (${distinct.size} distinct strips)`,
        'every card shows the same colours — swatches are reading the applied theme');

    for (const id of ['gameboy', 'c64']) {
        check(byValue[id] && byValue[id] !== byValue.__default__,
            `${id}'s swatches differ from the default palette's`,
            `${id}: ${byValue[id]} vs default: ${byValue.__default__}`);
    }
}

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
         * The report stamps the palette it measured on the container when its
         * effect commits. Waiting for that, not sleeping: an early read sees the
         * PREVIOUS palette's rows and passes falsely.
         */
        await page.waitFor(
            `document.querySelector('[data-audited-theme]')?.dataset.auditedTheme === ${JSON.stringify(theme)}`,
            { label: `${theme} audit re-measures` });

        // Only a FAILING row carries the "(needs N)" suffix; scoped to the report.
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

        // The label states what was measured, not a verdict that reads as a lie on a failing run.
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

/*
 * The avatar hover animations (components/ds/avatarArt.ts + Avatar.module.css).
 * CSS Modules HASHES `@keyframes frogRest` and rewrites only the references
 * it can see; a name inside a custom property compiles fine and every avatar
 * silently stops moving. Only a real browser resolving keyframes knows.
 */
async function avatarHover(page) {
    console.log('\n\x1b[1m--- AVATARS ---\x1b[0m');

    await page.goto(`${CLIENT}/ds`);
    await page.waitFor(`!!document.querySelector('svg[data-avatar]')`,
        { timeout: 60000, label: 'the avatar catalog renders' });

    const ids = await page.evaluate(`
        return [...document.querySelectorAll('svg[data-avatar]')].map((el) => el.dataset.avatar);
    `);
    check(ids.length > 0, `the catalog draws ${ids.length} avatars`);

    let animated = 0;
    let stuck = null;
    for (const id of ids) {
        const state = await page.evaluate(`
            const el = document.querySelector('svg[data-avatar="${id}"]');
            el.scrollIntoView({ block: 'center' });
            const r = el.getBoundingClientRect();
            return JSON.stringify({
                idle: el.getAnimations({ subtree: true }).length,
                x: r.left + r.width / 2,
                y: r.top + r.height / 2,
                frames: el.querySelectorAll('g').length,
            });
        `);
        const { idle, x, y, frames } = JSON.parse(state);
        if (idle !== 0) { stuck = stuck || `${id} animates without being hovered`; continue; }
        if (frames < 2) continue;

        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        // Polled, not slept: a fixed wait is how this suite earns its flakiness.
        await settles(page,
            `document.querySelector('svg[data-avatar="${id}"]')`
            + `.getAnimations({ subtree: true }).length === ${frames}`,
            2000);
        const hovered = await page.evaluate(`
            const el = document.querySelector('svg[data-avatar="${id}"]');
            const running = el.getAnimations({ subtree: true });
            const lit = [...el.querySelectorAll('g')]
                .filter((g) => getComputedStyle(g).opacity !== '0').length;
            return JSON.stringify({ running: running.length, lit });
        `);
        const { running, lit } = JSON.parse(hovered);
        // One frame lit at a time: opaque portraits stacked, so two at once is a mess.
        if (running !== frames || lit !== 1) {
            stuck = stuck || `${id}: ${running}/${frames} keyframes resolved, ${lit} frames visible`;
        } else {
            animated++;
        }
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
    }

    // `animated` is ASSERTED: `frames < 2` skips silently above, so 1/12 would otherwise pass.
    check(!stuck && animated === ids.length,
        `every avatar animates on hover (${animated}/${ids.length})`,
        stuck || `${ids.length - animated} avatar(s) had no frames to animate`);

    // And nothing keeps running once the pointer leaves.
    const left = await page.evaluate(`
        return [...document.querySelectorAll('svg[data-avatar]')]
            .reduce((n, el) => n + el.getAnimations({ subtree: true }).length, 0);
    `);
    check(left === 0, 'the animations stop when the pointer leaves',
        `${left} animations still running with nothing hovered`);
}

/*
 * The seasonal mine and flag (components/ds/sprites.tsx): two <symbol>s
 * swapped on `data-theme`, which the catalog sets directly rather than through
 * the store, so this covers the path with no React state change at all.
 */
async function themeSprites(page) {
    console.log('\n\x1b[1m--- SPRITES ---\x1b[0m');

    await page.goto(`${CLIENT}/ds`);
    // The Chrome profile persists across runs; clear the settings blob and reload.
    await page.evaluate(`localStorage.removeItem('minesweeper_settings'); return true;`);
    await page.goto(`${CLIENT}/ds`);
    await page.waitFor(`!!document.querySelector('[data-sprite="mine"] use')`,
        { timeout: 60000, label: 'the board preview renders' });

    // The drawn art itself, so a swap that changes nothing fails.
    const read = () => page.evaluate(`
        const of = (kind) => {
            const use = document.querySelector('[data-sprite="' + kind + '"] use');
            const art = use && document.querySelector(use.getAttribute('href'));
            return art ? art.innerHTML : '';
        };
        return JSON.stringify({ mine: of('mine'), flag: of('flag') });
    `);
    const pick = async (theme) => {
        await page.evaluate(`
            const group = document.querySelector('[aria-label="Preview palette"]');
            [...group.querySelectorAll('input[type=radio]')].find(i => i.value === ${JSON.stringify(theme)}).click();
            return true;
        `);
        await page.waitFor(
            `document.documentElement.dataset.theme === ${JSON.stringify(theme)}`,
            { label: `${theme} applied` });
        await sleep(150);
        return JSON.parse(await read());
    };

    const base = JSON.parse(await read());
    check(base.mine.length > 0 && base.flag.length > 0,
        `the default palette draws both sprites (${base.mine.length}/${base.flag.length} bytes of art)`,
        'a <use> resolved to no symbol — the ids have drifted apart');

    for (const theme of ['halloween', 'christmas']) {
        const themed = await pick(theme);
        check(themed.mine !== base.mine && themed.flag !== base.flag,
            `${theme} swaps both sprites`,
            `${theme} is still drawing the default pair`);
    }

    // And back: the swap has to be reversible.
    await pick('gameboy');
    const plain = JSON.parse(await read());
    check(plain.mine === base.mine && plain.flag === base.flag,
        'leaving a holiday restores the default pair',
        'the seasonal art stayed after switching to an ordinary palette');
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
    // Poll: the guest can trail the host by a beat.
    check(await settles(guest, `document.body.textContent.includes('Waiting for host')`), 'the non-host is told to wait');

    /*
     * The lobby banner is the tallest chrome the board ever sits under, which
     * is why Board.tsx measures its own top offset rather than using a fixed
     * --ms-board-reserve; this fails on any reserve that went back to a guess.
     */
    const lobbyFit = JSON.parse(await host.evaluate(`
        const r = document.querySelector('[role=grid]').getBoundingClientRect();
        return JSON.stringify({
            top: Math.round(r.top + window.scrollY),
            height: Math.round(r.height),
            viewport: window.innerHeight,
        });
    `));
    check(lobbyFit.top + lobbyFit.height <= lobbyFit.viewport,
        `the board fits under the lobby banner (${lobbyFit.top + lobbyFit.height}px of ${lobbyFit.viewport}px)`,
        `the board spans ${lobbyFit.top}-${lobbyFit.top + lobbyFit.height}px in a ${lobbyFit.viewport}px viewport — `
        + 'the reserve is not tracking the status banner above the board');

    await host.evaluate(`
        const btn = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.includes('Start Game'));
        if (!btn) throw new Error('no Start Game button');
        btn.click();
        return true;
    `);
    await host.waitFor(`document.body.textContent.includes('Progress')`, { label: 'host progress panel' });
    await guest.waitFor(`document.body.textContent.includes('Progress')`, { label: 'guest progress panel' });
    pass('starting the game gives both players a progress panel');

    // Both start from the SAME board with a shared opening, so these are deltas.
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
     * Opens the nth still-closed cell. The index matters: reset restores the
     * same board, so always taking the FIRST closed cell re-clicks the same mine.
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
     * One click is a bad test of progress: it is a whole percent, so one cell
     * need not move it, and a blind click may hit a mine. So keep opening cells
     * until the HOST's number moves, taking the reset after a mine, then check
     * the guest saw the same number.
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
     * Reloading mid-race: the reloader must not FORFEIT (a disconnect and a
     * refresh look identical to the server), and the restored board must be
     * playable: boards are addressed by socket id, and a slot not repointed
     * ignores every click with nothing on screen.
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

/** A join link (?room=...) pre-fills the room code and jumps straight to the name dialog. */
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

/**
 * Keyboard play: arrows move the cursor, Space reveals, F flags, Escape
 * dismisses. Same emits as the mouse, so this only proves the keys reach them.
 */
async function keyboardPlay(page) {
    console.log('\n\x1b[1m--- KEYBOARD PLAY ---\x1b[0m');
    const room = 'smokekeys' + Date.now().toString().slice(-6);

    await page.goto(CLIENT);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 60000, label: 'landing ready for keyboard scenario' });
    await enterRoom(page, { room, name: 'Keys' });
    await page.waitFor(`${cellCount} >= 256`, { label: 'board renders' });

    // The cursor's live region doubles as the way of knowing what is under the cursor.
    const cursorLabel = () => page.evaluate(
        `return document.querySelector('[data-kb-announcer]')?.textContent || '';`);

    await page.key('ArrowRight', { code: 'ArrowRight', keyCode: 39 });
    await page.waitFor(`!!document.querySelector('[data-kb-cursor]')`, { label: 'arrow key shows the cursor' });
    pass('an arrow key shows the keyboard cursor');
    check((await cursorLabel()).startsWith('Unrevealed'), 'the live region announces the selected cell',
        `got "${await cursorLabel()}"`);

    await page.key(' ', { code: 'Space', keyCode: 32 });
    await page.waitFor(`${revealedCount} > 0`, { label: 'Space reveals' });
    pass('Space reveals the selected cell');

    // Walk to the corner (clamping proves the cursor stays on the board), then scan for an Unrevealed cell.
    for (let i = 0; i < 16; i++) await page.key('ArrowUp', { code: 'ArrowUp', keyCode: 38 });
    for (let i = 0; i < 16; i++) await page.key('ArrowLeft', { code: 'ArrowLeft', keyCode: 37 });
    let found = (await cursorLabel()).startsWith('Unrevealed');
    for (let row = 0; row < 3 && !found; row++) {
        for (let i = 0; i < 15 && !found; i++) {
            await page.key(row % 2 ? 'ArrowLeft' : 'ArrowRight', row % 2
                ? { code: 'ArrowLeft', keyCode: 37 } : { code: 'ArrowRight', keyCode: 39 });
            found = (await cursorLabel()).startsWith('Unrevealed');
        }
        if (!found) {
            await page.key('ArrowDown', { code: 'ArrowDown', keyCode: 40 });
            found = (await cursorLabel()).startsWith('Unrevealed');
        }
    }
    check(found, 'the cursor reached a covered cell', 'no Unrevealed cell in the top rows — cascade cannot have opened them all');

    await page.key('f', { keyCode: 70 });
    await page.waitFor(
        `[...document.querySelectorAll('[role=gridcell]')].some(c => (c.getAttribute('aria-label') || '').startsWith('Flagged'))`,
        { label: 'F flags the selected cell' });
    pass('F flags the selected cell');

    await page.key('Escape', { code: 'Escape', keyCode: 27 });
    await page.waitFor(`!document.querySelector('[data-kb-cursor]')`, { label: 'Escape hides the cursor' });
    pass('Escape hides the cursor');
}

/**
 * /daily opens on the board, with the prose below it. Only a real browser can
 * prove the route mounts a board with no click, that the prose is still served
 * BELOW the board (a layout fact jsdom cannot measure), and that the first-visit
 * explainer is keyed to real localStorage.
 */
async function daily(page) {
    console.log('\n\x1b[1m--- DAILY ---\x1b[0m');

    /*
     * A browser that has never played, forced. The smoke run shares one profile
     * across sections, so an earlier visit would otherwise decide this.
     */
    await page.goto(`${CLIENT}/daily`);
    await page.evaluate(`localStorage.removeItem('minesweeper_daily_explainer_seen'); return true`);
    await page.goto(`${CLIENT}/daily`);

    await page.waitFor(`document.querySelectorAll('[role=gridcell]').length > 0`,
        { timeout: 60000, label: 'arriving at /daily mounts the board with no click' });
    pass('arriving at /daily mounts the board with no click');

    // The board mounts exactly once here too — same invariant Grid.tsx has.
    const boards = await page.evaluate(`return document.querySelectorAll('[role=grid]').length`);
    check(boards === 1, 'the daily board mounts exactly once', `found ${boards} grids`);

    /*
     * The prose is why /daily is a route rather than a flag: it must stay served,
     * below the board, not deleted.
     */
    const prose = await page.evaluate(`
        const copy = document.querySelector('.ms-prose');
        const grid = document.querySelector('[role=grid]');
        if (!copy || !grid) return { served: !!copy };
        return {
            served: true,
            belowBoard: copy.getBoundingClientRect().top > grid.getBoundingClientRect().bottom,
            headings: [...copy.querySelectorAll('h1')].length,
        };
    `);
    check(prose.served, 'the indexable prose is still served',
        '/daily lost the copy that is the reason it is a route');
    check(prose.belowBoard, 'the prose sits below the board',
        'the copy is in front of the puzzle again');
    check(prose.headings === 0, 'the prose leaves the page one h1',
        `the copy still carries ${prose.headings} h1s alongside the board's`);

    /* The rules live in this dialog now; a newcomer who never sees it gets an unexplained one-shot board. */
    const introOpen = await page.evaluate(
        `return !!document.querySelector('#dialog-daily-intro[open]')`);
    check(introOpen, 'the explainer greets a browser that has never played',
        'a newcomer gets the board with nothing saying it is one attempt');

    await page.click(`[aria-label="Close the rules and play today's puzzle"]`);
    await page.waitFor(`!document.querySelector('#dialog-daily-intro[open]')`,
        { label: 'Got it dismisses the explainer' });
    pass('Got it dismisses the explainer');

    /*
     * Closing has to WRITE the flag, not just hide the dialog. The button marks
     * it seen itself because the <dialog> `close` event does not fire in every engine.
     */
    const stored = await page.evaluate(
        `return localStorage.getItem('minesweeper_daily_explainer_seen')`);
    check(stored === 'true', 'dismissing records that this browser has seen it',
        `the flag is ${stored} — the explainer will greet this player again`);

    await page.goto(`${CLIENT}/daily`);
    await page.waitFor(`document.querySelectorAll('[role=gridcell]').length > 0`,
        { timeout: 60000, label: 'the daily reloads' });
    await sleep(500);
    const introAgain = await page.evaluate(
        `return !!document.querySelector('#dialog-daily-intro[open]')`);
    check(!introAgain, 'the explainer stays gone on the next visit',
        'a returning player is re-read the rules every morning');

    /*
     * The front page's link. Plain /daily, never parameterised: the route reads
     * no parameters, so anything appended is state a sender chose for a reader.
     */
    await page.goto(CLIENT);
    await sleep(1500);
    await page.evaluate(`
        const leave = [...document.querySelectorAll('button')]
            .find(b => /Return to Home/i.test(b.textContent));
        if (leave) leave.click();
        return true;
    `);
    await page.waitFor(`!!document.querySelector('[aria-label^="Play today\\'s daily challenge"]')`,
        { timeout: 60000, label: 'the landing page renders its daily button' });

    const href = await page.evaluate(
        `return document.querySelector('[aria-label^="Play today\\'s daily challenge"]').getAttribute('href')`);
    check(href === '/daily', `the landing button links to plain /daily (${href})`,
        `expected /daily with no query, got ${href}`);

    await page.click(`[aria-label^="Play today's daily challenge"]`);
    await page.waitFor(`document.querySelectorAll('[role=gridcell]').length > 0`,
        { label: 'the landing button lands on the board' });
    pass('the landing button lands on the board');
}

/**
 * Reactions: one client taps an emote, the other sees it, and it goes away on
 * its own. Needs a real browser: the tray is mounted ONCE for both layouts,
 * and the chip's lifetime is a timer, so jsdom cannot show it was on screen.
 */
async function emotes(host, guest) {
    console.log('\n\x1b[1m--- EMOTES ---\x1b[0m');
    const room = 'smokemote' + Date.now().toString().slice(-6);

    await host.goto(CLIENT);
    await guest.goto(CLIENT);
    await host.waitFor(`!!document.querySelector('form[aria-label="Create new room form"] button[type=submit]')`,
        { timeout: 60000, label: 'host landing ready' });

    await enterRoom(host, { room, name: 'Emoter', mode: 'create' });
    await host.waitFor(`${cellCount} > 0`, { label: 'host board' });
    await enterRoom(guest, { room, name: 'Watcher', mode: 'join' });
    await guest.waitFor(`${cellCount} > 0`, { label: 'guest board' });

    const trayCount = `document.querySelectorAll('[aria-label="Send a reaction"]').length`;
    check(await host.evaluate(`return ${trayCount};`) === 1,
        'the tray is mounted exactly once, like the board',
        'two trays in the DOM — the layouts duplicated it');

    /*
     * The VISIBLE chips only: the wrapper's textContent would be satisfied by
     * the sr-only live region alone. A chip is the only <span> wrapping a glyph.
     */
    const feedText = `(() => {
        const tray = document.querySelector('[aria-label="Send a reaction"]');
        if (!tray) return '';
        return [...tray.parentElement.querySelectorAll('span')]
            .filter(s => s.querySelector('svg[data-emote]'))
            .map(s => s.textContent)
            .join(' ');
    })()`;

    await host.evaluate(`
        const btn = document.querySelector('[aria-label="Send a reaction"] button[aria-label="Nice"]');
        if (!btn) throw new Error('no Nice button in the tray');
        btn.click();
        return true;
    `);

    check(await settles(guest, `${feedText}.includes('Emoter')`),
        "the other player sees who reacted",
        'the reaction never reached the second client');

    // Everyone sees the same feed, sender included: the server fans out with io.to.
    check(await settles(host, `${feedText}.includes('Emoter')`),
        'the sender sees their own reaction too');

    /* Scoped to the tray's subtree: the game screen carries four other polite live regions. */
    const feedAnnouncement = `(() => {
        const tray = document.querySelector('[aria-label="Send a reaction"]');
        const live = tray && tray.parentElement.querySelector('[aria-live=polite]');
        return live ? live.textContent : '';
    })()`;
    check(await settles(guest, `${feedAnnouncement}.includes('Emoter: Nice')`),
        'it is announced as speech, not as a picture',
        'the live region never carried the reaction');

    /* PingLayer's own region by its own marker: the grid also holds the keyboard cursor's. */
    const pingAnnouncement = `(() => {
        const live = document.querySelector('[data-ping-announcer]');
        return live ? live.textContent : '';
    })()`;

    // The lifetime is a plain timer, so this one has to wait in real time.
    check(await settles(guest, `!${feedText}.includes('Emoter')`, 8000),
        'it clears itself without anyone dismissing it',
        'the chip is still on screen well past its lifetime');

    /*
     * Pings. The CLICK needs a real browser: the interception runs in the
     * capture phase on the grid, and what it proves is a negative.
     */
    const openCount = `document.querySelectorAll('[role=gridcell][aria-label^="Unrevealed"]').length`;
    const closedBefore = await host.evaluate(`return ${openCount};`);

    await host.evaluate(`
        const btn = document.querySelector('[aria-label="Ping a cell"]');
        if (!btn) throw new Error('no ping button in the tray');
        btn.click();
        return true;
    `);
    check(await host.evaluate(`return !!document.querySelector('[aria-label="Cancel ping"]');`),
        'the tray arms a ping and renames the button',
        'the button did not change state');

    /*
     * A REAL press, not `.click()`: the interception listens on mousedown, and
     * the opened-cell branch acts on mouseup, so a bare click is too late.
     */
    await host.evaluate(`
        const cell = document.querySelector('[role=gridcell][data-row="2"][data-col="3"]');
        if (!cell) throw new Error('no cell at 2,3');
        const target = cell.firstElementChild || cell;
        for (const type of ['mousedown', 'mouseup', 'click']) {
            target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
        }
        return true;
    `);

    check(await settles(guest, `document.querySelectorAll('[data-ping]').length > 0`),
        'the other player sees a ring on the pinged cell',
        'no ring appeared on the second client');

    check(await settles(guest, `${pingAnnouncement}.includes('Emoter pinged row 3, column 4')`),
        'the ping is announced with the same 1-based cell the label uses',
        'the live region never named the pinged cell');

    // The negative that matters: pointing at a cell must not play it.
    check(await host.evaluate(`return ${openCount};`) === closedBefore,
        'the pinged cell was not opened by the click that pinged it',
        'the ping opened the cell — the capture interception let a handler through');

    check(await host.evaluate(`return !!document.querySelector('[aria-label="Ping a cell"]');`),
        'the arm is one-shot and clears itself',
        'the board is still armed after the ping');

    check(await settles(guest, `document.querySelectorAll('[data-ping]').length === 0`, 8000),
        'the ring clears itself without anyone dismissing it',
        'the ring is still on the board well past its lifetime');
}

(async () => {
    await preflight();
    const chrome = await launchChrome();

    try {
        const page = await attach(await newTarget('about:blank'));
        await coop(page);
        await sizeAndDifficulty(page);
        await desktopFit(page);
        await mobileFit(page);
        await headerClearance(page);
        await rejoinOnReload(page);
        await keyboardPlay(page);
        await daily(page);
        await themeContrast(page);
        await themeSprites(page);
        await themeSwatches(page);
        await avatarHover(page);

        const host = await attach(await newTarget('about:blank'));
        const guest = await attach(await newTarget('about:blank'));
        await pvp(host, guest);

        // Fresh tabs: the PVP pair are still in a race and a reload puts them back in it.
        const emoteHost = await attach(await newTarget('about:blank'));
        const emoteGuest = await attach(await newTarget('about:blank'));
        await emotes(emoteHost, emoteGuest);

        const linkHost = await attach(await newTarget('about:blank'));
        const linkGuest = await attach(await newTarget('about:blank'));
        await joinLink(linkHost, linkGuest);

        console.log('\n\x1b[1m--- CONSOLE ---\x1b[0m');
        const errors = [...page.consoleErrors, ...host.consoleErrors, ...guest.consoleErrors,
            ...emoteHost.consoleErrors, ...emoteGuest.consoleErrors,
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
