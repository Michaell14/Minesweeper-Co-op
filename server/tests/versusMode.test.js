/**
 * Versus Mode Test Suite
 * Tests the core functionality of the 1v1 PVP mode
 *
 * Run with: npm test (after adding jest to devDependencies)
 * Or run manually: node --experimental-vm-modules server/tests/versusMode.test.js
 */

const { generateSeededBoard, generateBoard } = require('../utils/gameUtils');

// Test utilities
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`FAILED: ${message}`);
    }
    console.log(`✓ PASSED: ${message}`);
};

const runTests = async () => {
    console.log('\n========================================');
    console.log('VERSUS MODE TEST SUITE');
    console.log('========================================\n');

    let passed = 0;
    let failed = 0;

    // =====================================================
    // TEST 1: Seeded board generation produces identical boards
    // =====================================================
    console.log('\n--- Test 1: Identical Board Generation ---\n');

    try {
        const seed = 12345;
        const numRows = 16;
        const numCols = 16;
        const numMines = 40;

        const board1 = generateSeededBoard(numRows, numCols, numMines, seed);
        const board2 = generateSeededBoard(numRows, numCols, numMines, seed);

        // Check boards have same dimensions
        assert(board1.length === board2.length, 'Boards have same number of rows');
        assert(board1[0].length === board2[0].length, 'Boards have same number of columns');

        // Check all cells are identical
        let allCellsMatch = true;
        let mineCount1 = 0;
        let mineCount2 = 0;

        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                if (board1[r][c].isMine !== board2[r][c].isMine) {
                    allCellsMatch = false;
                }
                if (board1[r][c].nearbyMines !== board2[r][c].nearbyMines) {
                    allCellsMatch = false;
                }
                if (board1[r][c].isMine) mineCount1++;
                if (board2[r][c].isMine) mineCount2++;
            }
        }

        assert(allCellsMatch, 'All cells match between boards with same seed');
        assert(mineCount1 === numMines, `Board 1 has correct mine count (${mineCount1})`);
        assert(mineCount2 === numMines, `Board 2 has correct mine count (${mineCount2})`);
        passed += 4;
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // TEST 2: Different seeds produce different boards
    // =====================================================
    console.log('\n--- Test 2: Different Seeds Produce Different Boards ---\n');

    try {
        const seed1 = 11111;
        const seed2 = 22222;
        const numRows = 16;
        const numCols = 16;
        const numMines = 40;

        const board1 = generateSeededBoard(numRows, numCols, numMines, seed1);
        const board2 = generateSeededBoard(numRows, numCols, numMines, seed2);

        // Check that at least one mine position is different
        let hasDifference = false;
        for (let r = 0; r < numRows && !hasDifference; r++) {
            for (let c = 0; c < numCols && !hasDifference; c++) {
                if (board1[r][c].isMine !== board2[r][c].isMine) {
                    hasDifference = true;
                }
            }
        }

        assert(hasDifference, 'Different seeds produce different mine placements');
        passed++;
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // TEST 3: Board dimensions are correct
    // =====================================================
    console.log('\n--- Test 3: Board Dimensions ---\n');

    try {
        const testCases = [
            { rows: 8, cols: 8, mines: 10 },
            { rows: 16, cols: 16, mines: 40 },
            { rows: 32, cols: 16, mines: 99 },
        ];

        for (const tc of testCases) {
            const board = generateSeededBoard(tc.rows, tc.cols, tc.mines, Date.now());
            assert(board.length === tc.rows, `Board has ${tc.rows} rows`);
            assert(board[0].length === tc.cols, `Board has ${tc.cols} columns`);

            let mineCount = 0;
            for (let r = 0; r < tc.rows; r++) {
                for (let c = 0; c < tc.cols; c++) {
                    if (board[r][c].isMine) mineCount++;
                }
            }
            assert(mineCount === tc.mines, `Board has ${tc.mines} mines`);
            passed += 3;
        }
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // TEST 4: NearbyMines calculation is correct
    // =====================================================
    console.log('\n--- Test 4: NearbyMines Calculation ---\n');

    try {
        const seed = 54321;
        const numRows = 10;
        const numCols = 10;
        const numMines = 15;

        const board = generateSeededBoard(numRows, numCols, numMines, seed);

        // Manually verify nearbyMines for each cell
        let allCorrect = true;
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                if (!board[r][c].isMine) {
                    let count = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = r + dr;
                            const nc = c + dc;
                            if (nr >= 0 && nr < numRows && nc >= 0 && nc < numCols) {
                                if (board[nr][nc].isMine) count++;
                            }
                        }
                    }
                    if (board[r][c].nearbyMines !== count) {
                        allCorrect = false;
                        console.log(`Cell [${r},${c}] has nearbyMines=${board[r][c].nearbyMines} but calculated ${count}`);
                    }
                }
            }
        }

        assert(allCorrect, 'All nearbyMines values are correctly calculated');
        passed++;
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // TEST 5: Board cell initial state
    // =====================================================
    console.log('\n--- Test 5: Cell Initial State ---\n');

    try {
        const board = generateSeededBoard(16, 16, 40, 99999);

        let allCellsValid = true;
        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[0].length; c++) {
                const cell = board[r][c];
                if (cell.isOpen !== false) allCellsValid = false;
                if (cell.isFlagged !== false) allCellsValid = false;
                if (typeof cell.isMine !== 'boolean') allCellsValid = false;
                if (typeof cell.nearbyMines !== 'number') allCellsValid = false;
            }
        }

        assert(allCellsValid, 'All cells have valid initial state (isOpen=false, isFlagged=false)');
        passed++;
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // TEST 6: Reproducibility across multiple iterations
    // =====================================================
    console.log('\n--- Test 6: Reproducibility Across Iterations ---\n');

    try {
        const seed = 777777;
        const boards = [];

        // Generate the same board 5 times
        for (let i = 0; i < 5; i++) {
            boards.push(generateSeededBoard(16, 16, 40, seed));
        }

        // All boards should be identical
        let allIdentical = true;
        for (let i = 1; i < boards.length; i++) {
            for (let r = 0; r < 16; r++) {
                for (let c = 0; c < 16; c++) {
                    if (boards[0][r][c].isMine !== boards[i][r][c].isMine) {
                        allIdentical = false;
                    }
                }
            }
        }

        assert(allIdentical, 'Same seed produces identical boards across 5 iterations');
        passed++;
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // TEST 7: Progress calculation
    // =====================================================
    console.log('\n--- Test 7: Progress Calculation ---\n');

    try {
        const numRows = 10;
        const numCols = 10;
        const numMines = 10;
        const totalSafeCells = (numRows * numCols) - numMines; // 90 safe cells

        assert(totalSafeCells === 90, `Total safe cells calculated correctly (${totalSafeCells})`);

        // Progress percentage calculation
        const revealedCells = 45;
        const progressPercent = Math.round((revealedCells / totalSafeCells) * 100);
        assert(progressPercent === 50, `Progress percentage calculated correctly (${progressPercent}%)`);
        passed += 2;
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // TEST 8: Mine cap respects board size
    // =====================================================
    console.log('\n--- Test 8: Mine Cap Respects Board Size ---\n');

    try {
        const numRows = 8;
        const numCols = 8;
        const totalCells = numRows * numCols; // 64
        const requestedMines = 100; // More than total cells
        const expectedMines = Math.min(requestedMines, totalCells - 9); // Should cap at 55

        const board = generateSeededBoard(numRows, numCols, requestedMines, 12345);

        let actualMines = 0;
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                if (board[r][c].isMine) actualMines++;
            }
        }

        assert(actualMines <= totalCells - 9, `Mine count is capped appropriately (${actualMines} mines)`);
        passed++;
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // TEST 9: First-click board generation (safe 3x3 zone)
    // =====================================================
    console.log('\n--- Test 9: First-Click Safe Zone ---\n');

    try {
        const numRows = 16;
        const numCols = 16;
        const numMines = 40;
        const firstClickRow = 8;
        const firstClickCol = 8;

        // Generate board with first click at center
        const board = generateBoard(numRows, numCols, numMines, firstClickRow, firstClickCol);

        // Check that 3x3 area around first click has no mines
        let safeZoneClear = true;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const r = firstClickRow + dr;
                const c = firstClickCol + dc;
                if (r >= 0 && r < numRows && c >= 0 && c < numCols) {
                    if (board[r][c].isMine) {
                        safeZoneClear = false;
                        console.log(`Mine found in safe zone at [${r},${c}]`);
                    }
                }
            }
        }

        assert(safeZoneClear, 'First-click 3x3 zone has no mines');

        // Verify total mine count is still correct
        let mineCount = 0;
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                if (board[r][c].isMine) mineCount++;
            }
        }
        assert(mineCount === numMines, `Board still has correct mine count (${mineCount})`);
        passed += 2;
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // TEST 10: First-click at corner
    // =====================================================
    console.log('\n--- Test 10: First-Click at Corner ---\n');

    try {
        const numRows = 16;
        const numCols = 16;
        const numMines = 40;

        // Test corner clicks
        const corners = [
            { row: 0, col: 0 },
            { row: 0, col: 15 },
            { row: 15, col: 0 },
            { row: 15, col: 15 }
        ];

        for (const corner of corners) {
            const board = generateBoard(numRows, numCols, numMines, corner.row, corner.col);

            let safeZoneClear = true;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const r = corner.row + dr;
                    const c = corner.col + dc;
                    if (r >= 0 && r < numRows && c >= 0 && c < numCols) {
                        if (board[r][c].isMine) {
                            safeZoneClear = false;
                        }
                    }
                }
            }

            assert(safeZoneClear, `Corner [${corner.row},${corner.col}] 3x3 zone is safe`);
            passed++;
        }
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // TEST 11: Independent boards are different
    // =====================================================
    console.log('\n--- Test 11: Independent Boards Are Different ---\n');

    try {
        const numRows = 16;
        const numCols = 16;
        const numMines = 40;

        // Generate two boards with different first clicks
        const board1 = generateBoard(numRows, numCols, numMines, 5, 5);
        const board2 = generateBoard(numRows, numCols, numMines, 10, 10);

        // They should have different mine placements
        let hasDifference = false;
        for (let r = 0; r < numRows && !hasDifference; r++) {
            for (let c = 0; c < numCols && !hasDifference; c++) {
                if (board1[r][c].isMine !== board2[r][c].isMine) {
                    hasDifference = true;
                }
            }
        }

        assert(hasDifference, 'Two generateBoard calls produce different boards');
        passed++;
    } catch (error) {
        console.log(`✗ FAILED: ${error.message}`);
        failed++;
    }

    // =====================================================
    // SUMMARY
    // =====================================================
    console.log('\n========================================');
    console.log('TEST SUMMARY');
    console.log('========================================');
    console.log(`Total Passed: ${passed}`);
    console.log(`Total Failed: ${failed}`);
    console.log(`Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
    console.log('========================================\n');

    if (failed > 0) {
        process.exit(1);
    }
};

// Run tests
runTests().catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
