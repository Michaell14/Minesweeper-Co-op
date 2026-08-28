/** The drill checker: what a player can prove, and whether a drill is honest. */

import { describe, expect, test } from 'vitest';
import { adjacentMines, deduce, explain, nextHint, validateDrill } from './drillDeduction';
import type { Drill } from './drills';

describe('counting', () => {
    test('a satisfied number proves its covered neighbours safe', () => {
        // The 0 touches one covered cell, and wants no mines.
        expect(deduce(['.#'])).toEqual({ mines: [], safe: [[0, 1]] });
    });

    test('a number equal to its covered neighbours proves them all mines', () => {
        expect(deduce(['1*'])).toEqual({ mines: [[0, 1]], safe: [] });
    });
});

describe('fixpoint', () => {
    test('a deduction feeds the next one', () => {
        // The trailing 0 proves (0,2) safe, which only then leaves the 1 one candidate.
        expect(deduce(['*1#.'])).toEqual({ mines: [[0, 0]], safe: [[0, 2]] });
    });

    test('a board with nothing provable proves nothing', () => {
        expect(deduce(['1#', '#*'])).toEqual({ mines: [], safe: [] });
    });
});

describe('subset reduction', () => {
    test('a bigger count over a superset proves the extra cells mines', () => {
        expect(deduce(['121', '*#*'])).toEqual({
            mines: [[1, 0], [1, 2]],
            safe: [[1, 1]],
        });
    });

    test('an equal count over a superset proves the extra cells safe', () => {
        expect(deduce(['1111', '*##*'])).toEqual({
            mines: [[1, 0], [1, 3]],
            safe: [[1, 1], [1, 2]],
        });
    });
});

describe('rule restriction', () => {
    test('counting alone cannot crack a board that needs subset reduction', () => {
        expect(deduce(['1111', '*##*'], ['counting'])).toEqual({ mines: [], safe: [] });
    });

    test('subset alone still reaches what only counting could start', () => {
        expect(deduce(['.#'], ['subset'])).toEqual({ mines: [], safe: [] });
    });
});

const drill = (over: Partial<Drill> & Pick<Drill, 'layout' | 'solution'>): Drill => ({
    id: 'test',
    lesson: 'counting',
    prompt: 'Prove what you can.',
    explanation: 'Because.',
    ...over,
});

describe('validateDrill', () => {
    test('an honest drill has no problems', () => {
        expect(validateDrill(drill({
            layout: ['*1.', '11.', '...'],
            solution: { flag: [[0, 0]], open: [] },
        }))).toEqual([]);
    });

    test('rejects a ragged layout', () => {
        const problems = validateDrill(drill({
            layout: ['*1.', '11'],
            solution: { flag: [[0, 0]], open: [] },
        }));
        expect(problems.join(' ')).toMatch(/ragged|length/i);
    });

    test('rejects an unknown character', () => {
        const problems = validateDrill(drill({
            layout: ['*1x', '11.', '...'],
            solution: { flag: [[0, 0]], open: [] },
        }));
        expect(problems.join(' ')).toMatch(/character/i);
    });

    test('rejects a digit that miscounts its own neighbours', () => {
        const problems = validateDrill(drill({
            layout: ['*2.', '11.', '...'],
            solution: { flag: [[0, 0]], open: [] },
        }));
        expect(problems.join(' ')).toMatch(/0,1/);
    });

    test('rejects a flagged cell that is not a mine', () => {
        const problems = validateDrill(drill({
            layout: ['.#'],
            solution: { flag: [[0, 1]], open: [] },
        }));
        expect(problems.join(' ')).toMatch(/flag/i);
    });

    test('rejects an opened cell that is a mine', () => {
        const problems = validateDrill(drill({
            layout: ['1*'],
            solution: { flag: [], open: [[0, 1]] },
        }));
        expect(problems.join(' ')).toMatch(/open/i);
    });

    test('rejects a solution that asks for less than is provable', () => {
        const problems = validateDrill(drill({
            lesson: 'one-two-one',
            layout: ['121', '*#*'],
            solution: { flag: [[1, 0], [1, 2]], open: [] },
        }));
        expect(problems.join(' ')).toMatch(/1,1/);
    });

    test('rejects a board hiding a mine nobody could deduce', () => {
        // Ground truth would accept a lucky flag on (1,1), but it is not in the
        // solution — so the drill could never be finished.
        const problems = validateDrill(drill({
            layout: ['1#', '#*'],
            solution: { flag: [], open: [] },
        }));
        expect(problems.join(' ')).toMatch(/1,1/);
        expect(problems.join(' ')).toMatch(/deduc|provable/i);
    });

    test('rejects a solution that asks for more than is provable', () => {
        const problems = validateDrill(drill({
            layout: ['1#', '#*'],
            solution: { flag: [[1, 1]], open: [] },
        }));
        expect(problems).not.toEqual([]);
    });
});

describe('the lesson gate', () => {
    test('a counting drill that secretly needs subset reduction is rejected', () => {
        const problems = validateDrill(drill({
            lesson: 'counting',
            layout: ['121', '*#*'],
            solution: { flag: [[1, 0], [1, 2]], open: [[1, 1]] },
        }));
        expect(problems.join(' ')).toMatch(/cannot reach/i);
    });

    test('a pattern drill that plain counting already solves is rejected', () => {
        const problems = validateDrill(drill({
            lesson: 'one-two-one',
            layout: ['*1.', '11.', '...'],
            solution: { flag: [[0, 0]], open: [] },
        }));
        expect(problems.join(' ')).toMatch(/never needs/i);
    });

    test('a drill that needs exactly its lesson rules passes both bounds', () => {
        expect(validateDrill(drill({
            lesson: 'one-two-one',
            layout: ['121', '*#*'],
            solution: { flag: [[1, 0], [1, 2]], open: [[1, 1]] },
        }))).toEqual([]);
    });
});

describe('adjacentMines', () => {
    test('counts the mines touching a cell', () => {
        expect(adjacentMines(['*#*', '###', '...'], 1, 1)).toBe(2);
    });

    test('a cell touching none counts zero', () => {
        expect(adjacentMines(['*#*', '###', '...'], 2, 1)).toBe(0);
    });

    test('does not run off the edge', () => {
        expect(adjacentMines(['*#'], 0, 1)).toBe(1);
    });
});

describe('explain', () => {
    test('a mine proven by counting names the number that proves it', () => {
        const why = explain(['1*'], 0, 1);
        expect(why?.verdict).toBe('mine');
        expect(why?.rule).toBe('counting');
        expect(why?.text).toMatch(/row 1, column 1/);
    });

    test('a safe cell proven by counting says the number is satisfied', () => {
        const why = explain(['.#'], 0, 1);
        expect(why?.verdict).toBe('safe');
        expect(why?.rule).toBe('counting');
    });

    test('a mine proven by subset reduction names both numbers', () => {
        const why = explain(['121', '*#*'], 1, 2);
        expect(why?.verdict).toBe('mine');
        expect(why?.rule).toBe('subset');
        // Both opened cells that produced the step have to appear, or the
        // explanation is not reproducible by the player.
        expect(why?.text).toMatch(/row 1, column 1/);
        expect(why?.text).toMatch(/row 1, column 2/);
    });

    test('a safe cell proven by subset reduction says so', () => {
        const why = explain(['1111', '*##*'], 1, 2);
        expect(why?.verdict).toBe('safe');
        expect(why?.rule).toBe('subset');
    });

    test('a cell nothing can prove has no explanation', () => {
        expect(explain(['1#', '#*'], 1, 1)).toBeNull();
    });

    test('an opened cell has no explanation', () => {
        expect(explain(['1*'], 0, 0)).toBeNull();
    });
});

describe('nextHint', () => {
    // On this board the subset rule fires before counting can do anything, so
    // deduction order — not row-major order — is what a hint should follow.
    const LAYOUT = ['121', '*#*'];

    test('points at the first cell the rules can prove', () => {
        const hint = nextHint(LAYOUT, []);
        expect(hint?.at).toEqual([1, 2]);
        expect(hint?.why.verdict).toBe('mine');
    });

    test('skips what the player has already worked out', () => {
        expect(nextHint(LAYOUT, [[1, 2]])?.at).toEqual([1, 0]);
        expect(nextHint(LAYOUT, [[1, 2], [1, 0]])?.at).toEqual([1, 1]);
    });

    test('has nothing left to offer on a finished board', () => {
        expect(nextHint(LAYOUT, [[1, 2], [1, 0], [1, 1]])).toBeNull();
    });
});

describe('the pattern gate', () => {
    test('rejects a drill whose lesson pattern is nowhere on the board', () => {
        // 1221 is a real board, but it holds no 121 anywhere.
        const problems = validateDrill(drill({
            lesson: 'one-two-one',
            layout: ['1221', '#**#'],
            solution: { flag: [[1, 1], [1, 2]], open: [[1, 0], [1, 3]] },
        }));
        expect(problems.join(' ')).toMatch(/121/);
        expect(problems.join(' ')).toMatch(/pattern/i);
    });

    test('rejects a 1-2 drill whose first subset step proves a cell safe, not a mine', () => {
        // '1121' does contain '12', so only the DIRECTION of the first step
        // separates this from a genuine 1-2 board.
        const problems = validateDrill(drill({
            lesson: 'one-two',
            layout: ['1121', '#*#*'],
            solution: { flag: [[1, 1], [1, 3]], open: [[1, 0], [1, 2]] },
        }));
        expect(problems.join(' ')).toMatch(/first subset/i);
    });

    test('accepts the pattern read down a column, not just along a row', () => {
        expect(validateDrill(drill({
            lesson: 'one-two-one',
            layout: ['1*', '2#', '1*'],
            solution: { flag: [[0, 1], [2, 1]], open: [[1, 1]] },
        }))).toEqual([]);
    });
});

describe('cells the player could never resolve', () => {
    test('rejects a board holding a covered cell no number can reach', () => {
        // (0,0) touches only covered cells, so nothing will ever prove it and
        // the board can never be cleared.
        const problems = validateDrill(drill({
            layout: ['##.', '##.', '...'],
            solution: { flag: [], open: [[0, 1], [1, 0], [1, 1]] },
        }));
        expect(problems.join(' ')).toMatch(/0,0/);
        expect(problems.join(' ')).toMatch(/resolve|finish/i);
    });
});
