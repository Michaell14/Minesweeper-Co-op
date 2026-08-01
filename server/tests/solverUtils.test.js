const { isBoardSolvable, solveWithStats } = require('../utils/solverUtils');
const { generateBoard } = require('../utils/gameUtils');

describe('Minesweeper Solver Utils', () => {
    test('Identifies a completely solvable 8x8 easy board', () => {
        // Generate standard 8x8 board with 10 mines
        let solvableFound = false;
        for (let attempt = 0; attempt < 50; attempt++) {
            const board = generateBoard(8, 8, 10, 0, 0);
            if (isBoardSolvable(board, 0, 0)) {
                solvableFound = true;
                break;
            }
        }
        expect(solvableFound).toBe(true);
    });

    test('Correctly identifies an unsolvable 50:50 deadlock board', () => {
        // Construct a manual 2x2 board where 1 mine is hidden between (0,1) and (1,1)
        // (0,0) is open with 1 mine neighbor. Both (0,1) and (1,1) touch (0,0) identically.
        const unsolvableBoard = [
            [{ isMine: false, nearbyMines: 1 }, { isMine: true, nearbyMines: 0 }],
            [{ isMine: false, nearbyMines: 1 }, { isMine: false, nearbyMines: 0 }]
        ];
        
        // Starting at (0,0), player opens '1', leaving (0,1) and (1,1) as identical 50:50 candidates.
        const isSolvable = isBoardSolvable(unsolvableBoard, 0, 0);
        expect(isSolvable).toBe(false);
    });

    /**
     * A guard against the solver blowing up, not a benchmark.
     *
     * It matters because no-guess generation calls isBoardSolvable in a
     * generate-and-verify loop — many times per board — so an exponential
     * regression here doesn't slow room creation down, it hangs it.
     *
     * This used to time a single cold call with Date.now() and assert under
     * 10ms, and CI failed it at 12ms. That wasn't a slow solver: a warm solve
     * measured here is ~0.2ms, so the old test was mostly measuring JIT warm-up
     * and Date.now()'s ~1ms resolution. Warming up first and taking a median
     * removes both.
     *
     * Measured locally: 0.11ms fastest, 0.18ms median, 0.89ms worst of fifteen.
     * The 25ms budget is ~140x the median and ~28x the worst run, which leaves
     * room for a CI runner several times slower than this machine plus a GC
     * pause, while still failing on anything in the same league as a 100x
     * regression. Tighter than that starts measuring the runner again.
     */
    test('Performance: a 16x16 solve stays far away from pathological', () => {
        const board = generateBoard(16, 16, 40, 5, 5);

        isBoardSolvable(board, 5, 5);   // warm up, so JIT cost isn't in the measurement

        const runs = [];
        for (let i = 0; i < 5; i++) {
            const started = process.hrtime.bigint();
            isBoardSolvable(board, 5, 5);
            runs.push(Number(process.hrtime.bigint() - started) / 1e6);
        }
        const median = runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)];

        expect(median).toBeLessThan(25);
    });
});

describe('solveWithStats', () => {
    /**
     * The daily challenge (server/game/daily.js) picks the hardest of many
     * solvable candidates by rule2Count -- these tests are what pin down that
     * "hardest" actually tracks something real, not just a number that moves.
     */

    test('agrees with isBoardSolvable on solvability', () => {
        for (let attempt = 0; attempt < 20; attempt++) {
            const board = generateBoard(9, 9, 10, 4, 4);
            expect(solveWithStats(board, 4, 4).solvable).toBe(isBoardSolvable(board, 4, 4));
        }
    });

    test('a board starting on a mine is unsolvable with zero steps of either rule', () => {
        const board = [
            [{ isMine: true, nearbyMines: 0 }, { isMine: false, nearbyMines: 1 }],
            [{ isMine: false, nearbyMines: 1 }, { isMine: false, nearbyMines: 1 }],
        ];

        expect(solveWithStats(board, 0, 0)).toEqual({ solvable: false, rule1Count: 0, rule2Count: 0 });
    });

    test('a board solvable by single-cell deduction alone needs zero Rule 2 steps', () => {
        // 1x3, mine at the far end: starting on the 0 cascades open the
        // middle '1', whose only unrevealed neighbor is the mine -- a single
        // Rule 1 flag finishes the board. No overlapping-neighborhood
        // reasoning ever comes up.
        const board = [[
            { isMine: false, nearbyMines: 0 },
            { isMine: false, nearbyMines: 1 },
            { isMine: true, nearbyMines: 0 },
        ]];

        const stats = solveWithStats(board, 0, 0);
        expect(stats.solvable).toBe(true);
        expect(stats.rule1Count).toBeGreaterThan(0);
        expect(stats.rule2Count).toBe(0);
    });

    test('a board requiring subset reasoning reports at least one Rule 2 step', () => {
        // No single hand-built board reliably demonstrates this: the solver
        // only ever opens what's reachable from ONE start cell's cascade, so
        // hand-placing "given" clues next to unknowns without also leaking
        // mine-adjacency into the cells that are supposed to cascade them
        // open is exactly the kind of subset puzzle this test is about --
        // search real generated boards instead, at a high enough density that
        // pure single-cell deduction usually isn't enough on its own.
        let found = null;
        for (let attempt = 0; attempt < 200 && !found; attempt++) {
            const board = generateBoard(16, 16, 53, 8, 8, { noGuess: false });
            const stats = solveWithStats(board, 8, 8);
            if (stats.solvable && stats.rule2Count > 0) found = stats;
        }

        expect(found).not.toBeNull();
        expect(found.rule2Count).toBeGreaterThan(0);
    });

    test('sampling many candidates at the same density finds a real spread of hardness', () => {
        // The premise the daily challenge's "hardest of a pool" selection
        // depends on: solvable boards at a given density are NOT uniformly
        // difficulty -- some need far more Rule 2 reasoning than others, so
        // picking the max out of many is a genuine choice, not a coin flip.
        // ~7% of candidates are solvable at this density (ARCHITECTURE.md
        // §5), so 400 attempts comfortably clears the sample size below.
        const rule2Counts = [];
        for (let attempt = 0; attempt < 400 && rule2Counts.length < 25; attempt++) {
            const board = generateBoard(16, 16, 53, 8, 8, { noGuess: false });
            const stats = solveWithStats(board, 8, 8);
            if (stats.solvable) rule2Counts.push(stats.rule2Count);
        }

        expect(rule2Counts.length).toBeGreaterThan(8); // enough of a sample to mean something
        expect(Math.max(...rule2Counts)).toBeGreaterThan(Math.min(...rule2Counts));
    });
});
