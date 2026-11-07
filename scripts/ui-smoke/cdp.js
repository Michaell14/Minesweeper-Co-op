/**
 * Minimal Chrome DevTools Protocol driver over the installed Chrome and Node's
 * global WebSocket, so the smoke test needs no dependencies (CHROME_PATH
 * overrides). Under `CI` the sandbox and /dev/shm flags go on: a container may
 * not grant user namespaces, and a small /dev/shm kills the renderer mid-run.
 */
const { spawn } = require('child_process');

const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
].filter(Boolean);

const PORT = Number(process.env.CDP_PORT || 9222);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** How many console errors a timeout repeats; the end of the run still checks them all. */
const RECENT_ERRORS = 3;

/** Inputs a person types into. Not password: this ends up in CI logs. */
const TEXT_TYPES = ['text', 'search', 'email', 'url', 'tel', 'number', 'textarea'];

/*
 * What the page showed when a wait gave up, gathered in the page. These fields
 * tell the usual causes apart: a keystroke lost to focus (dialog still open,
 * focus elsewhere), an emit that never got an answer ("Creating room…" or
 * "Connection lost" under role=status), and the wrong board (the cell count).
 * checkVisibility, not offsetParent: the connection banner is position: fixed.
 * The condition runs once more because this lands after the deadline, so true
 * here means the condition came true late.
 */
const pageState = (expression) => `
    const describe = (el) => {
        if (!el) return 'nothing';
        const label = el.getAttribute('aria-label');
        const name = el.getAttribute('name');
        const dialog = el.parentElement?.closest('dialog[id]');
        return el.tagName.toLowerCase()
            + (el.id ? '#' + el.id : label ? '[aria-label="' + label + '"]' : name ? '[name="' + name + '"]' : '')
            + (dialog ? ' in #' + dialog.id : '');
    };
    const visible = (selector) => [...document.querySelectorAll(selector)].filter((el) => el.checkVisibility());
    let condition;
    try { condition = String(!!(${expression})); } catch (e) { condition = 'threw ' + e.message; }
    return {
        url: location.href,
        dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => '#' + (d.id || '(no id)')),
        focus: describe(document.activeElement),
        gridcells: document.querySelectorAll('[role=gridcell]').length,
        inputs: visible('input, textarea')
            .filter((el) => ${JSON.stringify(TEXT_TYPES)}.includes(el.type))
            .map((el) => describe(el) + ' = ' + JSON.stringify(el.value)),
        status: visible('[role=status], [role=alert]')
            .map((el) => el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80))
            .filter(Boolean)
            .slice(0, 5),
        condition,
    };
`;

function findChrome() {
    const fs = require('fs');
    const found = CHROME_CANDIDATES.find((p) => {
        try { return fs.existsSync(p); } catch { return false; }
    });
    if (!found) {
        throw new Error(
            'Could not find Chrome. Set CHROME_PATH to the browser binary.\n' +
            'Looked in:\n  ' + CHROME_CANDIDATES.join('\n  ')
        );
    }
    return found;
}

async function launchChrome() {
    const binary = findChrome();
    const ciFlags = process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];
    const proc = spawn(binary, [
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        '--user-data-dir=/tmp/minesweeper-ui-smoke-profile',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--window-size=1440,900',
        ...ciFlags,
        'about:blank',
    ], { stdio: 'ignore' });

    for (let i = 0; i < 60; i++) {
        await sleep(250);
        try {
            const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
            if (r.ok) return proc;
        } catch { /* not up yet */ }
    }
    proc.kill();
    throw new Error(`Chrome never exposed its debugging port on ${PORT}`);
}

/** Opens a fresh tab and returns its target descriptor. */
async function newTarget(url = 'about:blank') {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    if (!r.ok) throw new Error(`could not open a tab: HTTP ${r.status}`);
    return await r.json();
}

/** Attaches to a page target and returns a small automation API. */
async function attach(target) {
    let page = target;
    if (!page) {
        const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        page = targets.find((t) => t.type === 'page');
    }
    if (!page) throw new Error('no page target to attach to');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    const consoleErrors = [];

    ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && pending.has(data.id)) {
            const { resolve, reject } = pending.get(data.id);
            pending.delete(data.id);
            data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result);
            return;
        }
        if (data.method === 'Runtime.exceptionThrown') {
            consoleErrors.push(data.params.exceptionDetails?.exception?.description || 'uncaught exception');
        }
        if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
            consoleErrors.push((data.params.args || []).map((a) => a.value || a.description).join(' '));
        }
    };

    const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const msgId = ++id;
            pending.set(msgId, { resolve, reject });
            ws.send(JSON.stringify({ id: msgId, method, params }));
            setTimeout(() => {
                if (pending.has(msgId)) { pending.delete(msgId); reject(new Error(`CDP timeout: ${method}`)); }
            }, 15000);
        });

    await send('Runtime.enable');
    await send('Page.enable');

    /** Evaluates a function body in the page and returns its value. */
    const evaluate = async (body) => {
        const r = await send('Runtime.evaluate', {
            expression: `(async () => { ${body} })()`,
            returnByValue: true,
            awaitPromise: true,
        });
        if (r.exceptionDetails) {
            throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)));
        }
        return r.result.value;
    };

    /**
     * The page as a timed-out wait left it, as indented lines for the error.
     * Never throws: if the page cannot answer, that goes in the report and the
     * timeout is still the error.
     */
    const describePage = async (expression, timeout) => {
        let lines;
        try {
            const s = await evaluate(pageState(expression));
            lines = [
                `url: ${s.url}`,
                `open dialogs: ${s.dialogs.join(', ') || 'none'}`,
                `focus: ${s.focus}`,
                `gridcells: ${s.gridcells}`,
                `text inputs: ${s.inputs.join(', ') || 'none'}`,
                `status: ${s.status.join(' | ') || 'none'}`,
                `condition now: ${s.condition === 'true' ? 'true (it came true after the timeout)' : s.condition}`,
            ];
        } catch (e) {
            lines = [`page state unavailable: ${String(e.message).split('\n')[0]}`];
        }
        // Held on this side, so they survive a page that cannot answer.
        const recent = consoleErrors.slice(-RECENT_ERRORS);
        lines.push(`console errors: ${recent.length ? `last ${recent.length} of ${consoleErrors.length}` : 'none'}`);
        for (const error of recent) {
            lines.push(...error.split('\n').slice(0, 3).map((l, i) => (i ? '    ' : '  ') + l.trim()));
        }
        return [`page after ${timeout}ms:`, ...lines.map((l) => '  ' + l)].join('\n');
    };

    /** Polls an expression until it is truthy; on timeout, throws with what the page showed. */
    const waitFor = async (expression, { timeout = 10000, label } = {}) => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const value = await evaluate(`return (${expression});`);
            if (value) return value;
            await sleep(150);
        }
        throw new Error(`timed out waiting for: ${label || expression}\n${await describePage(expression, timeout)}`);
    };

    /** Real mouse click at the centre of a selector, scrolled into view first. */
    const click = async (selector, { button = 'left', nth = 0 } = {}) => {
        const box = await evaluate(`
            const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}];
            if (!el) return null;
            el.scrollIntoView({ block: 'center', inline: 'center' });
            const r = el.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        `);
        if (!box) throw new Error(`no element matched ${selector}[${nth}]`);
        await sleep(100);
        const base = { x: box.x, y: box.y, button, clickCount: 1 };
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
        await sleep(120);
    };

    /** Sets an input's value the way a real keystroke would, so React notices. */
    const type = async (selector, value) => {
        await evaluate(`
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) throw new Error('no input matched ' + ${JSON.stringify(selector)});
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, ${JSON.stringify(value)});
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        `);
        await sleep(80);
    };

    const goto = async (url) => {
        await send('Page.navigate', { url });
        await sleep(1200);
    };

    /** Presses one key. `keyDown` rather than `rawKeyDown` so single characters carry text. */
    const key = async (k, { code, keyCode = 0 } = {}) => {
        const base = {
            key: k,
            code: code || k,
            windowsVirtualKeyCode: keyCode,
            nativeVirtualKeyCode: keyCode,
        };
        await send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            // Enter needs its character event too, or Chrome never exercises
            // native implicit form submission (unlike an actual key press).
            ...(k === 'Enter' ? { text: '\r' } : k.length === 1 ? { text: k } : {}),
            ...base,
        });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        await sleep(80);
    };

    return { send, evaluate, waitFor, click, type, key, goto, consoleErrors, close: () => ws.close() };
}

module.exports = { launchChrome, attach, newTarget, sleep };
