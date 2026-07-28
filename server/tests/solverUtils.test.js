const { isBoardSolvable } = require('../utils/solverUtils');
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
