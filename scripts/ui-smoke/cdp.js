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

    /** Polls an expression until it is truthy, or throws on timeout. */
    const waitFor = async (expression, { timeout = 10000, label } = {}) => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const value = await evaluate(`return (${expression});`);
            if (value) return value;
            await sleep(150);
        }
        throw new Error(`timed out waiting for: ${label || expression}`);
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
            ...(k.length === 1 ? { text: k } : {}),
            ...base,
        });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        await sleep(80);
    };

    return { send, evaluate, waitFor, click, type, key, goto, consoleErrors, close: () => ws.close() };
}

module.exports = { launchChrome, attach, newTarget, sleep };
