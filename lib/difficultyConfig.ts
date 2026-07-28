/**
 * Difficulty Configuration
 * Preset board dimensions and mine counts for different difficulty levels
 *
 * Mine density is kept relatively low to reduce 50/50 guessing situations:
 * - Easy: 12.3% mine density (10 mines / 81 cells)
 * - Medium: 15.6% mine density (40 mines / 256 cells)
 * - Hard: 18.8% mine density (60 mines / 320 cells)
 *
 * For comparison, classic Minesweeper Expert difficulty is 20.6%
 */
export const difficultyConfig = [
    {
        rows: 9,
        cols: 9,
        mines: 10,
        title: "Easy",
    },
    {
        rows: 16,
        cols: 16,
        mines: 40,
        title: "Medium",
    },
    {
        rows: 20,
        cols: 16,
        mines: 60,
        title: "Hard",
    },
];