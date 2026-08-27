/** The drill catalog: types and authored content. Pure data. */

export type Coord = readonly [row: number, col: number];

export type LessonId =
    | 'counting'
    | 'one-one'
    | 'one-two'
    | 'one-two-one'
    | 'one-two-two-one'
    | 'reduction';

export interface Drill {
    id: string;
    lesson: LessonId;
    prompt: string;
    /** Row-major, one char per cell: `.` zero, `1`-`8` opened, `#` covered safe, `*` covered mine. */
    layout: readonly string[];
    solution: { flag: readonly Coord[]; open: readonly Coord[] };
    explanation: string;
}

export const DRILLS: readonly Drill[] = [
    {
        id: 'counting-a',
        lesson: 'counting',
        prompt: 'Flag every mine you can prove.',
        layout: ['*1.', '11.', '...'],
        solution: { flag: [[0, 0]], open: [] },
        explanation: 'The 1 touches exactly one covered cell, so that cell is the mine it is counting.',
    },
    {
        id: 'one-two-one-a',
        lesson: 'one-two-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['121', '*#*'],
        solution: { flag: [[1, 0], [1, 2]], open: [[1, 1]] },
        explanation: 'The two 1s each want one mine and the 2 wants both. Only mine-safe-mine satisfies all three.',
    },
];

export const drillsForLesson = (lesson: LessonId): Drill[] =>
    DRILLS.filter((d) => d.lesson === lesson);
