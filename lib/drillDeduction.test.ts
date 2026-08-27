/** The drill checker: what a player can prove, and whether a drill is honest. */

import { describe, expect, test } from 'vitest';
import { deduce, validateDrill } from './drillDeduction';
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
