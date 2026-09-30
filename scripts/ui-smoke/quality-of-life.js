/** Browser-only regressions: native dialog keys, clipboard denial and focus. */
module.exports = async function qualityOfLife(page, { client, check, selectCard }) {
    console.log('\n--- QUALITY OF LIFE ---');
    await page.goto(client);
    await page.waitFor(`!!document.querySelector('form[aria-label="Create new room form"]')`);

    const selectedSize = () => page.evaluate(`return document.querySelector('[aria-label="Select board size"] input:checked')?.value;`);
    await selectCard(page, 'Select board size', 'Small');
    await selectCard(page, 'Select board size', 'Custom');
    await page.waitFor(`document.getElementById('dialog-custom')?.open`);
    await page.type('#dialog-custom input[name="rows"]', '24');
    await page.click('[aria-label="Cancel custom board settings"]');
    check(await selectedSize() === 'Small', 'Cancel keeps the previously selected board size');

    await selectCard(page, 'Select board size', 'Custom');
    await page.waitFor(`document.querySelector('#dialog-custom input[name="rows"]')?.value === '9'`);
    check(true, 'reopening custom settings discards the canceled draft');
    await page.type('#dialog-custom input[name="rows"]', '20');
    await page.key('Escape', { keyCode: 27 });
    await page.waitFor(`!document.getElementById('dialog-custom')?.open`);
    check(await selectedSize() === 'Small', 'Escape also preserves the selected board');

    await selectCard(page, 'Select board size', 'Custom');
    await page.waitFor(`document.getElementById('dialog-custom')?.open`);
    await page.type('#dialog-custom input[name="rows"]', '12');
    await page.type('#dialog-custom input[name="cols"]', '10');
    await page.click('#dialog-custom input[name="cols"]');
    await page.key('Enter', { keyCode: 13 });
    await page.waitFor(`!document.getElementById('dialog-custom')?.open`);
    check(await selectedSize() === 'Custom', 'Enter confirms a valid custom board');

    await page.click('form[aria-label="Create new room form"] button[type=submit]');
    await page.waitFor(`document.getElementById('dialog-name-create')?.open`);
    await page.type('#dialog-name-create input', '   ');
    await page.click('#dialog-name-create input');
    await page.key('Enter', { keyCode: 13 });
    check(await page.evaluate(`return document.getElementById('dialog-name-create').open && document.body.textContent.includes('Enter a name to continue.');`),
        'blank names keep the dialog open with an inline explanation');
    await page.type('#dialog-name-create input', '  QoL Guest  ');
    await page.key('Enter', { keyCode: 13 });
    await page.waitFor(`document.querySelectorAll('[role=gridcell]').length === 120`);
    check(true, 'Enter creates the configured board and trims the player name');
    const room = await page.evaluate(`return document.querySelector('[aria-label^="Room code:"]').textContent.trim();`);

    // Simulate a denied clipboard permission; never change the user's clipboard.
    await page.evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Permission denied'); } } });`);
    const copyIndex = await page.evaluate(`return [...document.querySelectorAll('[aria-label="Copy shareable room link to clipboard"]')].findIndex(el => el.offsetParent !== null);`);
    await page.click('[aria-label="Copy shareable room link to clipboard"]', { nth: copyIndex });
    await page.waitFor(`!!document.querySelector('[aria-label="Room invite link"]')`);
    check(await page.evaluate(`const el = document.activeElement; return el.getAttribute('aria-label') === 'Room invite link' && el.selectionStart === 0 && el.selectionEnd === el.value.length;`),
        'clipboard failure exposes and selects a link for manual copying');
    check(await page.evaluate(`return new URL(document.querySelector('[aria-label="Room invite link"]').value).searchParams.get('room') === ${JSON.stringify(room)};`),
        'the fallback link contains the current room');

    // Advance by actual Tab presses, starting immediately before the grid in DOM order.
    await page.evaluate(`
        const grid = document.querySelector('[role=grid]');
        const focusable = [...document.querySelectorAll('button,a[href],input,[tabindex="0"]')]
            .filter(el => el.offsetParent !== null && !el.disabled);
        focusable[focusable.indexOf(grid) - 1].focus();
    `);
    await page.key('Tab', { keyCode: 9 });
    check(await page.evaluate(`return document.activeElement?.getAttribute('role') === 'grid' && !!document.querySelector('[data-kb-cursor]');`),
        'Tab enters the board with a selected keyboard cell');
    await page.key('ArrowRight', { keyCode: 39 });
    check(await page.evaluate(`return document.activeElement?.getAttribute('role') === 'grid';`),
        'arrow movement keeps focus on the board');
    await page.key('Escape', { keyCode: 27 });
    await page.click('[aria-label="Ping a cell"]');
    await page.key('Escape', { keyCode: 27 });
    check(await page.evaluate(`return !!document.querySelector('[aria-label="Ping a cell"][aria-pressed="false"]') && !document.querySelector('[data-kb-cursor]');`),
        'Escape cancels an armed ping without a keyboard cursor');

    const leaveIndex = await page.evaluate(`return [...document.querySelectorAll('[aria-label="Leave room and return to home page"]')].findIndex(el => el.offsetParent !== null);`);
    await page.click('[aria-label="Leave room and return to home page"]', { nth: leaveIndex });
    await page.waitFor(`!!document.querySelector('form[aria-label="Join existing room form"]')`);
    await page.type('form[aria-label="Join existing room form"] input', `  ${client}/?room=${encodeURIComponent(room)}  `);
    await page.click('form[aria-label="Join existing room form"] button[type=submit]');
    await page.waitFor(`document.getElementById('dialog-name-join')?.open`);
    check(await page.evaluate(`return document.querySelector('form[aria-label="Join existing room form"] input').value === ${JSON.stringify(room)};`),
        'pasting a complete invite link extracts the room code');
    check(await page.evaluate(`return document.querySelector('#dialog-name-join input').value === 'QoL Guest';`),
        'returning home and joining again remembers the guest name');
    await page.key('Escape', { keyCode: 27 });

    await page.goto(`${client}/settings`);
    await page.waitFor(`!![...document.querySelectorAll('button')].find(el => el.textContent === 'New theme')`);
    const savedInk = await page.evaluate(`return getComputedStyle(document.documentElement).getPropertyValue('--ms-palette-ink').trim();`);
    await page.evaluate(`document.querySelectorAll('button').forEach(el => { if (el.textContent === 'New theme') el.click(); });`);
    await page.waitFor(`!!document.querySelector('input[type="color"]')`);
    const previewInk = savedInk.toLowerCase() === '#113355' ? '#553311' : '#113355';
    await page.type('input[type="color"]', previewInk);
    await page.waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--ms-palette-ink').trim() === ${JSON.stringify(previewInk)}`);
    // Client navigation must unmount the editor; a page reload would mask the bug.
    await page.click('a[href="/drills"]');
    await page.waitFor(`location.pathname === '/drills'`);
    check(await page.evaluate(`return getComputedStyle(document.documentElement).getPropertyValue('--ms-palette-ink').trim();`) === savedInk,
        'leaving an unsaved theme preview restores the saved palette');

    await page.click('a[href="/drills/counting"]');
    await page.waitFor(`!!document.querySelector('button[role="gridcell"][aria-label^="Unrevealed"]')`);
    const before = await page.evaluate(`const cell = document.querySelector('button[role="gridcell"][aria-label^="Unrevealed"]'); cell.id = 'smoke-drill-target'; cell.focus(); return cell.getAttribute('aria-label');`);
    await page.key(' ', { code: 'Space', keyCode: 32 });
    const after = await page.evaluate(`return document.getElementById('smoke-drill-target').getAttribute('aria-label');`);
    check(before !== after, 'Space activates a drill cell exactly once');
};
