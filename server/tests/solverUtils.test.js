const { isBoardSolvable, solveWithStats } = require('../domain/solverUtils');
const { generateBoard } = require('../domain/boardGen');

describe('Minesweeper Solver Utils', () => {
    test('Identifies a completely solvable 8x8 easy board', () => {
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
        // 2x2 with one mine: (0,0) opens showing 1, and (0,1)/(1,1) touch it identically.
        const unsolvableBoard = [
            [{ isMine: false, nearbyMines: 1 }, { isMine: true, nearbyMines: 0 }],
            [{ isMine: false, nearbyMines: 1 }, { isMine: false, nearbyMines: 0 }]
        ];
        
        const isSolvable = isBoardSolvable(unsolvableBoard, 0, 0);
        expect(isSolvable).toBe(false);
    });

    /**
     * A guard against the solver blowing up, not a benchmark: no-guess
     * generation calls isBoardSolvable many times per board, so an exponential
     * regression hangs room creation. Warmed up and taken as a median, because
     * a cold single call mostly measured JIT warm-up. Measured locally: 0.18ms
     * median, 0.89ms worst; 25ms leaves room for a slow CI runner while still
     * failing a 100x regression.
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
     * The daily (server/game/daily.js) picks the hardest candidate by
     * rule2Count; these pin that "hardest" tracks something real.
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
        // 1x3, mine at the far end: the cascade opens the middle '1', and one Rule 1 flag finishes it.
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
        // No hand-built board reliably shows this: the solver only opens what
        // ONE start cell's cascade reaches, so search generated boards at a
        // density where single-cell deduction usually is not enough.
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
        // The premise of the daily's "hardest of a pool": solvable boards at one
        // density are NOT uniformly hard. ~7% are solvable here (ARCHITECTURE.md
        // §5), so 400 attempts clears the sample size below.
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
