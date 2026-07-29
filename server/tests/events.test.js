/**
 * Guards the socket protocol contract.
 *
 * Event names used to be string literals typed out in both halves, so a typo
 * produced an event nobody listened to and no error anywhere — the failure mode
 * was a feature silently not working. These tests keep the two halves in step
 * and stop the literals creeping back.
 *
 * They read source files as text on purpose: the client is TypeScript and cannot
 * be imported here, but its handler table is declarative enough to check.
 */

const fs = require('fs');
const path = require('path');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('../../shared/events');

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/** Our server source, excluding tests and dependencies. */
const SERVER_FILES = [
    'server/server.js',
    'server/game/coop.js',
    'server/game/pvp.js',
    'server/game/index.js',
    'server/utils/gameUtils.js',
    'server/utils/playerUtils.js',
    'server/controllers/pvpController.js',
];
const serverSource = SERVER_FILES.map(read).join('\n');
const clientHandlers = read('hooks/useGameEvents.ts');
const clientActions = read('hooks/useGameActions.ts');
const eventTypes = read('shared/events.d.ts');
const payloadTypes = read('shared/socketPayloads.ts');

describe('the event name tables', () => {
    test('every value is unique within its direction', () => {
        const clientValues = Object.values(CLIENT_EVENTS);
        const serverValues = Object.values(SERVER_EVENTS);
        expect(new Set(clientValues).size).toBe(clientValues.length);
        expect(new Set(serverValues).size).toBe(serverValues.length);
    });

    test('the two directions do not reuse a name', () => {
        const overlap = Object.values(CLIENT_EVENTS).filter((v) => Object.values(SERVER_EVENTS).includes(v));
        expect(overlap).toEqual([]);
    });
});

describe('the server uses the constants', () => {
    test.each(Object.entries(CLIENT_EVENTS))('registers a handler for %s', (key) => {
        expect(serverSource).toContain(`CLIENT_EVENTS.${key}`);
    });

    test('no raw event-name literal is emitted or listened for', () => {
        // 'disconnect' is socket.io's own, not part of this protocol.
        const literals = [...serverSource.matchAll(/(?:\.emit|socket\.on)\(\s*['"]([a-zA-Z]+)['"]/g)]
            .map((m) => m[1])
            .filter((name) => name !== 'disconnect');
        expect(literals).toEqual([]);
    });
});

describe('the client covers what the server sends', () => {
    /** Keys of the handler table in hooks/useGameEvents.ts. */
    const handledKeys = [...clientHandlers.matchAll(/\[SERVER_EVENTS\.([A-Z_]+)\]:/g)].map((m) => m[1]);

    test.each(Object.keys(SERVER_EVENTS))('handles %s', (key) => {
        expect(handledKeys).toContain(key);
    });

    test('handles nothing the server never sends', () => {
        const unknown = handledKeys.filter((k) => !(k in SERVER_EVENTS));
        expect(unknown).toEqual([]);
    });

    test('the table has exactly one entry per server event', () => {
        expect(handledKeys.length).toBe(Object.keys(SERVER_EVENTS).length);
        expect(new Set(handledKeys).size).toBe(handledKeys.length);
    });

    test('client emits use the constants rather than literals', () => {
        const literals = [...clientActions.matchAll(/socket\.emit\(\s*['"]([a-zA-Z]+)['"]/g)].map((m) => m[1]);
        expect(literals).toEqual([]);
    });
});

describe('every server event is actually sent', () => {
    test.each(Object.entries(SERVER_EVENTS))('%s is emitted somewhere', (key) => {
        expect(serverSource).toContain(`SERVER_EVENTS.${key}`);
    });
});


/**
 * shared/events.d.ts restates the event names with literal types, because the
 * client cannot get literal types out of a .js file and without them the
 * handler table degrades to `any` (see the file's own header). That makes it the
 * one place in shared/ where a name is written twice, so it needs a guard: the
 * declarations must match shared/events.js exactly, in both directions.
 */
describe('the TypeScript declarations match the runtime names', () => {
    /** `READONLY_KEY: 'value';` pairs out of the .d.ts, per declared const. */
    const declaredPairs = (constName) => {
        const block = eventTypes.split(`const ${constName}: {`)[1];
        if (!block) return null;
        return Object.fromEntries(
            [...block.split('};')[0].matchAll(/readonly\s+([A-Z_]+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
        );
    };

    test.each([
        ['CLIENT_EVENTS', CLIENT_EVENTS],
        ['SERVER_EVENTS', SERVER_EVENTS],
    ])('%s declares exactly the runtime keys and values', (name, runtime) => {
        const declared = declaredPairs(name);
        expect(declared).not.toBeNull();
        // toEqual both ways at once: a missing, extra or mistyped entry fails.
        expect(declared).toEqual({ ...runtime });
    });
});

/**
 * Payload shapes used to live only in ARCHITECTURE.md and inline at each
 * handler, so nothing stopped an event being added without anyone saying what
 * travels with it. shared/socketPayloads.ts is now that declaration, and this
 * keeps it complete. It checks names only — TypeScript checks the shapes, and
 * only on the client half.
 */
describe('every event has a declared payload type', () => {
    /** Keys of an interface body in socketPayloads.ts. */
    const interfaceKeys = (name) => {
        const body = payloadTypes.split(`export interface ${name} {`)[1];
        if (!body) return null;
        return [...body.split('\n}')[0].matchAll(/^\s{4}([a-zA-Z]+):/gm)].map((m) => m[1]);
    };

    test.each([
        ['ClientToServerEvents', CLIENT_EVENTS],
        ['ServerToClientEvents', SERVER_EVENTS],
    ])('%s covers exactly its half of the protocol', (name, runtime) => {
        const declared = interfaceKeys(name);
        expect(declared).not.toBeNull();
        expect(declared.sort()).toEqual(Object.values(runtime).sort());
    });
});
