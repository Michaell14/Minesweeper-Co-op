/**
 * The server's module layering, enforced rather than described. `gameUtils`
 * and `playerUtils` once required each other, and `resetGame()` threw
 * depending on which file node loaded first; `tests/resetGame.test.js` guards
 * that function, this guards the shape. Two rules, derived from the import
 * graph: no cycles, and no module imports a HIGHER layer than itself.
 *
 * Layers, lowest first (a module may import its own layer or below):
 *   0  config, validation      1  initialize*Client      2  domain/ (pure)
 *   3  data/                   4  utils/                 5  game/
 *   6  controllers/            7  routes/                8  server.js
 *
 * Adding a layer means editing `layerOf`, so a move that breaks the ordering
 * fails here instead of becoming the next load-order bug.
 */

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.join(__dirname, '..');

/**
 * Where a file sits. Returns null for anything the table does not name rather
 * than defaulting to the top layer: a default would let a new directory import
 * from anywhere with the enforcement quietly off. An unclassified file fails
 * the suite instead.
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
    if (rel.startsWith(`routes${path.sep}`)) return 7;
    if (rel === 'server.js') return 8;
    return null;
};

/**
 * Every .js file we ship, excluding tests and dependencies. `migrations/` is
 * excluded too: node-pg-migrate runs them at release time (see /Procfile), the
 * server never requires them, and each is frozen once run in production.
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
 * The layer, or a failure, so an unclassified file cannot slip through the
 * comparison rules as a `null > 6` that quietly evaluates false.
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
     * Ahead of the rules because it keeps them meaningful: a file the table
     * does not name is a hole in the constraint, not a file with none.
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
     * The strictest rule, and the one board.js was created for: domain/ must be
     * computable without Redis, the socket server or configuration, which is
     * what lets both halves of a mode share it.
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
        // A floor, not an exact count: it only proves the walk found the real tree.
        expect(graph.size).toBeGreaterThan(15);
    });
});
