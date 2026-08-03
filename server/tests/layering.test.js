/**
 * The server's module layering, enforced rather than described.
 *
 * `gameUtils` and `playerUtils` used to require each other. The cycle meant
 * `gameUtils` captured `undefined` for `resetPlayerScores`, and `resetGame()`
 * threw — but only depending on which file node loaded first, so it looked like
 * a heisenbug rather than a dependency problem. `tests/resetGame.test.js` guards
 * that one function; this guards the shape that produced it.
 *
 * Two rules, both derived from the import graph rather than a list anyone has to
 * keep up to date:
 *
 *   1. No cycles, anywhere.
 *   2. No module imports a HIGHER layer than itself.
 *
 * Layers, lowest first. A module may import its own layer or below:
 *
 *   0  config, validation      leaves — import nothing
 *   1  initialize*Client       the io and Redis singletons
 *   2  domain/                 pure logic, no I/O
 *   3  data/                   repositories over Redis
 *   4  utils/                  services over repos + io
 *   5  game/                   per-mode cell actions
 *   6  controllers/            lifecycle flows
 *   7  server.js               socket wiring
 *
 * Adding a layer means editing `layerOf` here, which is the point: moving a file
 * somewhere that breaks the ordering fails this suite instead of quietly
 * creating the next load-order bug.
 */

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.join(__dirname, '..');

/**
 * Where a file sits. See the table above.
 *
 * Returns null for anything the table does not name, rather than defaulting to
 * the top layer. A default is what makes forgetting to edit this look safe: a
 * new `server/services/` would land at 7 alongside server.js, and every file in
 * it could then import from anywhere without tripping the ordering rule — the
 * enforcement quietly switched off for exactly the directory nobody had
 * thought about yet. An unclassified file fails the suite instead.
 */
const layerOf = (file) => {
    const rel = path.relative(SERVER_ROOT, file);
    if (rel === 'config.js' || rel === 'validation.js') return 0;
    if (rel.includes('initializeClient') || rel.includes('initializeRedisClient') || rel.includes('initializePgClient')) return 1;
    if (rel.startsWith(`domain${path.sep}`)) return 2;
    if (rel.startsWith(`data${path.sep}`)) return 3;
    if (rel.startsWith(`utils${path.sep}`)) return 4;
    if (rel.startsWith(`game${path.sep}`)) return 5;
    if (rel.startsWith(`controllers${path.sep}`)) return 6;
    if (rel === 'server.js') return 7;
    return null;
};

/**
 * Every .js file we ship, excluding tests and dependencies. `migrations/` is
 * excluded too, as a decision rather than an oversight: migration files are
 * executed by node-pg-migrate at release time (see /Procfile), are never
 * required by the server, and each one is frozen once it has run in
 * production — they are not part of the runtime module graph these rules
 * exist to protect.
 */
const sourceFiles = (dir = SERVER_ROOT) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return ['tests', 'node_modules', 'migrations'].includes(entry.name) ? [] : sourceFiles(full);
        }
        return entry.name.endsWith('.js') ? [full] : [];
    });

/** Relative requires from one file, resolved to absolute paths inside server/. */
const importsOf = (file) => {
    const source = fs.readFileSync(file, 'utf8');
    return [...source.matchAll(/require\('(\.[^']+)'\)/g)]
        .map((m) => {
            const resolved = path.resolve(path.dirname(file), m[1]);
            return resolved.endsWith('.js') ? resolved : `${resolved}.js`;
        })
        // shared/ lives outside server/ and is a leaf; node_modules is not ours.
        .filter((p) => p.startsWith(SERVER_ROOT + path.sep) && fs.existsSync(p));
};

const graph = new Map(sourceFiles().map((f) => [f, importsOf(f)]));
const show = (f) => path.relative(SERVER_ROOT, f);

/**
 * The layer, or a failure. Used by the comparison rules below so an
 * unclassified file cannot slip through them as a `null > 6` that quietly
 * evaluates false — the rule would report nothing and read as a pass.
 */
const layerOrThrow = (file) => {
    const layer = layerOf(file);
    if (layer === null) throw new Error(`${show(file)} is in no layer — add its directory to layerOf() above`);
    return layer;
};

describe('the module graph', () => {
    test('has no cycles', () => {
        const state = new Map();
        const found = [];

        const visit = (node, stack) => {
            state.set(node, 'visiting');
            for (const next of graph.get(node) || []) {
                if (state.get(next) === 'visiting') {
                    const from = stack.indexOf(next);
                    found.push([...stack.slice(from === -1 ? stack.length - 1 : from), next].map(show).join(' -> '));
                } else if (!state.has(next)) {
                    visit(next, [...stack, next]);
                }
            }
            state.set(node, 'done');
        };

        for (const node of graph.keys()) if (!state.has(node)) visit(node, [node]);

        expect(found).toEqual([]);
    });

    /*
     * Ahead of the rules, because it is what keeps them meaningful: a file the
     * table does not name is not a file with no constraints, it is a hole in
     * the constraint. Naming the whole tree is the price of the rules below
     * meaning anything.
     */
    test('every file is in a named layer', () => {
        const homeless = [...graph.keys()].filter((f) => layerOf(f) === null).map(show);
        expect(homeless).toEqual([]);
    });

    test('never imports upwards', () => {
        const inversions = [];
        for (const [file, deps] of graph) {
            for (const dep of deps) {
                if (layerOrThrow(dep) > layerOrThrow(file)) {
                    inversions.push(`${show(file)} (L${layerOf(file)}) -> ${show(dep)} (L${layerOf(dep)})`);
                }
            }
        }
        expect(inversions).toEqual([]);
    });

    /*
     * The strictest rule, and the one board.js was created for. Anything in
     * domain/ must be computable without Redis, without the socket server and
     * without configuration — that is what makes it safe for both halves of a
     * mode to share, and what stopped the original cycle recurring.
     */
    test('domain/ depends on nothing outside domain/', () => {
        const escapes = [];
        for (const [file, deps] of graph) {
            if (layerOrThrow(file) !== 2) continue;
            for (const dep of deps) {
                if (layerOrThrow(dep) !== 2) escapes.push(`${show(file)} -> ${show(dep)}`);
            }
        }
        expect(escapes).toEqual([]);
    });

    test('covers the whole server, so a new directory cannot slip past it', () => {
        // A floor, not an exact count — it only has to prove the walk found the
        // real tree rather than an empty one.
        expect(graph.size).toBeGreaterThan(15);
    });
});
