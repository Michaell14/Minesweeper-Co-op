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

    test('Performance: Solves or rejects a 16x16 board in under 10ms', () => {
        const board = generateBoard(16, 16, 40, 5, 5);
        const startTime = Date.now();
        isBoardSolvable(board, 5, 5);
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeLessThan(10);
    });
});
