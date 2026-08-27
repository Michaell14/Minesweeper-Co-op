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

export interface Lesson {
    id: LessonId;
    title: string;
    /** One line, shown on the index card and under the lesson heading. */
    blurb: string;
}

/**
 * Named patterns first — they are what players search for — then the general
 * rule that retires them.
 */
export const LESSONS: readonly Lesson[] = [
    {
        id: 'counting',
        title: 'Counting',
        blurb: 'A number equal to its covered neighbours means all mines. A satisfied number means all safe.',
    },
    {
        id: 'one-one',
        title: 'The 1-1 pattern',
        blurb: 'Two 1s along a wall, and the cell one of them cannot be counting.',
    },
    {
        id: 'one-two',
        title: 'The 1-2 pattern',
        blurb: 'A 1 beside a 2 along a wall: the far cell past the 2 is always a mine.',
    },
    {
        id: 'one-two-one',
        title: 'The 1-2-1 pattern',
        blurb: 'Mine, safe, mine — the only arrangement that satisfies all three numbers.',
    },
    {
        id: 'one-two-two-one',
        title: 'The 1-2-2-1 pattern',
        blurb: 'Safe, mine, mine, safe. The longer cousin of 1-2-1.',
    },
    {
        id: 'reduction',
        title: 'Subset reduction',
        blurb: 'The general rule every pattern above is a special case of.',
    },
];

export const lessonById = (id: string): Lesson | undefined =>
    LESSONS.find((lesson) => lesson.id === id);

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
