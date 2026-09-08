/**
 * Deterministic daily board generation: generateBoard's `options.rng` and
 * generateDailyBoardForDate. io and Redis are mocked by tests/setup/mockInfra.js.
 */

const { generateBoard, generateSingleCandidateBoard } = require('../domain/boardGen');
const {
    generateDailyBoardForDate,
    hardestSolvableCandidate,
    DAILY_CANDIDATE_POOL_SIZE,
    DAILY_MAX_ATTEMPTS,
} = require('../game/daily');
const { isBoardSolvable, solveWithStats } = require('../domain/solverUtils');
const { mulberry32, hashStringToSeed } = require('../domain/seededRandom');
const { DAILY_PRESET } = require('../../shared/boardConfig');

const countMines = (board) =>
    board.reduce((total, row) => total + row.filter((cell) => cell.isMine).length, 0);

describe('generateBoard: options.rng', () => {
    test('defaults to Math.random -- regular room generation is untouched', () => {
        const spy = jest.spyOn(Math, 'random');

        generateBoard(9, 9, 10, 4, 4, { noGuess: false });

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    test('a seeded rng produces a fully deterministic board across repeated calls', () => {
        const rngFor = () => mulberry32(hashStringToSeed('test-seed'));

        const boardA = generateBoard(16, 16, 40, 8, 8, { noGuess: false, rng: rngFor() });
        const boardB = generateBoard(16, 16, 40, 8, 8, { noGuess: false, rng: rngFor() });

        expect(boardA).toEqual(boardB);
    });

    test('does not consume the global Math.random when a seeded rng is supplied', () => {
        const spy = jest.spyOn(Math, 'random');

        generateBoard(9, 9, 10, 4, 4, { noGuess: false, rng: mulberry32(1) });

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    test('a seeded rng still honors the no-guess retry loop deterministically', () => {
        const rngFor = () => mulberry32(hashStringToSeed('daily-retry-seed'));

        const boardA = generateBoard(16, 16, 48, 8, 8, { noGuess: true, maxAttempts: 1000, rng: rngFor() });
        const boardB = generateBoard(16, 16, 48, 8, 8, { noGuess: true, maxAttempts: 1000, rng: rngFor() });

        expect(boardA).toEqual(boardB);
        expect(countMines(boardA)).toBe(48);
    });
});

describe('generateDailyBoardForDate', () => {
    const SAMPLE_DATES = ['2026-07-30', '2026-01-01', '2026-12-25', '2027-02-14', '2026-03-15'];

    test.each(SAMPLE_DATES)('produces a byte-identical board across repeated calls for %s', (date) => {
        const first = generateDailyBoardForDate(date);
        const second = generateDailyBoardForDate(date);

        expect(first.board).toEqual(second.board);
        expect(first.seed).toBe(second.seed);
        expect(first.startRow).toBe(second.startRow);
        expect(first.startCol).toBe(second.startCol);
    });

    test('different dates produce different boards', () => {
        const a = generateDailyBoardForDate('2026-07-30');
        const b = generateDailyBoardForDate('2026-07-31');

        expect(a.board).not.toEqual(b.board);
    });

    test.each(SAMPLE_DATES)('the board for %s is genuinely no-guess solvable', (date) => {
        const { board, startRow, startCol } = generateDailyBoardForDate(date);

        expect(isBoardSolvable(board, startRow, startCol)).toBe(true);
    });

    test('uses the DAILY_PRESET dimensions and mine count', () => {
        const { numRows, numCols, numMines } = generateDailyBoardForDate('2026-07-30');

        expect(numRows).toBe(DAILY_PRESET.rows);
        expect(numCols).toBe(DAILY_PRESET.cols);
        expect(numMines).toBe(DAILY_PRESET.mines);
        expect(countMines(generateDailyBoardForDate('2026-07-30').board)).toBe(DAILY_PRESET.mines);
    });

    test('opens the fixed center cell up front, like PVP\'s shared board', () => {
        const { board, startRow, startCol, openedCells } = generateDailyBoardForDate('2026-07-30');

        expect(startRow).toBe(Math.floor(DAILY_PRESET.rows / 2));
        expect(startCol).toBe(Math.floor(DAILY_PRESET.cols / 2));
        expect(board[startRow][startCol].isOpen).toBe(true);
        expect(openedCells).toBeGreaterThan(0);
    });
});

describe('generateDailyBoardForDate: picks the HARDEST solvable board, not just the first', () => {
    const { rows, cols, mines } = DAILY_PRESET;
    const startRow = Math.floor(rows / 2);
    const startCol = Math.floor(cols / 2);

    /** Independent replay of hardestSolvableCandidate: same seed stream, highest rule2Count kept. */
    const independentlyComputeHardest = (date) => {
        const rng = mulberry32(hashStringToSeed(`minesweeper-daily:${date}`));
        let best = null;
        let firstSolvableRule2Count = null;
        let solvableFound = 0;

        for (let attempt = 0; attempt < DAILY_MAX_ATTEMPTS && solvableFound < DAILY_CANDIDATE_POOL_SIZE; attempt++) {
            const candidate = generateSingleCandidateBoard(rows, cols, mines, startRow, startCol, rng);
            const { solvable, rule2Count } = solveWithStats(candidate, startRow, startCol);
            if (!solvable) continue;

            solvableFound++;
            if (firstSolvableRule2Count === null) firstSolvableRule2Count = rule2Count;
            if (!best || rule2Count > best) best = rule2Count;
        }

        return { hardestRule2Count: best, firstSolvableRule2Count };
    };

    test('hardestSolvableCandidate matches an independent replay of the same seed stream', () => {
        const rng = mulberry32(hashStringToSeed('minesweeper-daily:2026-07-30'));
        const result = hardestSolvableCandidate(rows, cols, mines, startRow, startCol, rng);
        const { hardestRule2Count } = independentlyComputeHardest('2026-07-30');

        expect(result).not.toBeNull();
        expect(result.rule2Count).toBe(hardestRule2Count);
    });

    test.each(['2026-07-30', '2026-01-01', '2026-12-25'])(
        'the daily board for %s needed at least as much subset reasoning as the first solvable candidate would have',
        (date) => {
            const daily = generateDailyBoardForDate(date);
            const { solvable, rule2Count: dailyRule2Count } = solveWithStats(daily.board, daily.startRow, daily.startCol);
            const { firstSolvableRule2Count } = independentlyComputeHardest(date);

            expect(solvable).toBe(true);
            expect(dailyRule2Count).toBeGreaterThanOrEqual(firstSolvableRule2Count);
        }
    );

    test('across several dates, picking the hardest of a pool beats "first solvable" on average', () => {
        // One date can tie by chance; the aggregate is what "not just a random board" rests on.
        const dates = ['2026-07-30', '2026-01-01', '2026-12-25', '2027-02-14', '2026-03-15', '2025-11-11', '2025-06-06'];

        let totalHardest = 0;
        let totalFirst = 0;
        for (const date of dates) {
            const { hardestRule2Count, firstSolvableRule2Count } = independentlyComputeHardest(date);
            totalHardest += hardestRule2Count;
            totalFirst += firstSolvableRule2Count;
        }

        expect(totalHardest).toBeGreaterThan(totalFirst);
    });
});
