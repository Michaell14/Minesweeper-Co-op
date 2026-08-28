/**
 * Guards the socket protocol contract.
 *
 * Event names used to be string literals typed out in both halves, so a typo
 * produced an event nobody listened to and no error anywhere — the failure mode
 * was a feature silently not working. These tests keep the two halves in step
 * and stop the literals creeping back.
 *
 * The CLIENT half is still read as text: it is TypeScript and cannot be imported
 * here, but its handler table is declarative enough to check. The SERVER half no
 * longer needs to be — `server/routes` is a table this can import directly.
 */

const fs = require('fs');
const path = require('path');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('../../shared/events');
const { ROUTES } = require('../routes');

const repoRoot = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/**
 * Our server source, excluding tests and dependencies.
 *
 * Walked rather than listed. The list used to be typed out by hand, which meant
 * moving an emit into a new file made this suite fail with "event never emitted"
 * — pointing at the event, not at the fact that nobody had added the file. A
 * guard against drift should not itself need manual upkeep.
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
     * The inbound half is checked against the ROUTE TABLE rather than by
     * scanning source for `CLIENT_EVENTS.X`, which only ever proved the name
     * appeared somewhere — a row could be commented out and this still passed.
     * `routes.test.js` owns the rest of the table's shape.
     */
    test.each(Object.entries(CLIENT_EVENTS))('has a route registered for %s', (_key, value) => {
        expect(ROUTES.map((route) => route.event)).toContain(value);
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
 * The event objects must stay frozen.
 *
 * `Object.freeze` is what makes TypeScript infer the literal `'boardUpdate'`
 * rather than widening to `string`, and literal types are the only reason the
 * client's handler table type-checks at all — without them every payload
 * degrades to `any`, silently. There used to be a hand-written `events.d.ts`
 * restating all 55 names to buy the same thing; unfreezing these would bring it
 * back, so this guards the four words that replaced it.
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
