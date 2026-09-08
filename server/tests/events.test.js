/**
 * Guards the socket protocol contract: a mistyped event name is a feature
 * silently not working. The client half is TypeScript and read as text (its
 * handler table is declarative enough); the server's route table is imported.
 */

const fs = require('fs');
const path = require('path');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('../../shared/events');
const { ROUTES } = require('../routes');

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/**
 * Server source, excluding tests and dependencies. Walked rather than listed,
 * so moving an emit into a new file needs no upkeep here.
 */
const collectServerFiles = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return ['tests', 'node_modules'].includes(entry.name) ? [] : collectServerFiles(full);
        }
        return entry.name.endsWith('.js') ? [full] : [];
    });

const SERVER_FILES = collectServerFiles(path.join(repoRoot, 'server'));
const serverSource = SERVER_FILES.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const clientHandlers = read('hooks/useGameEvents.ts');
const clientActions = read('hooks/useGameActions.ts');
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
    /*
     * Checked against the route table, not by grepping for the constant, which
     * a commented-out row would still pass. `routes.test.js` owns the table's shape.
     */
    test.each(Object.entries(CLIENT_EVENTS))('has a route registered for %s', (_key, value) => {
        expect(ROUTES.map((route) => route.event)).toContain(value);
    });

    test('no raw event-name literal is emitted or listened for', () => {
        // 'disconnect' is socket.io's own.
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
 * `Object.freeze` is what makes TypeScript infer literal event names instead
 * of `string`; without it every client payload silently degrades to `any`.
 */
describe('the event names carry literal types', () => {
    test.each([
        ['CLIENT_EVENTS', CLIENT_EVENTS],
        ['SERVER_EVENTS', SERVER_EVENTS],
    ])('%s is frozen, so TypeScript does not widen it to string', (_name, events) => {
        expect(Object.isFrozen(events)).toBe(true);
    });
});

/**
 * Keeps shared/socketPayloads.ts complete. Names only; TypeScript checks the
 * shapes, and only on the client half.
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
