/** The drill catalog: types and authored content. Pure data. */

export type Coord = readonly [row: number, col: number];

export type LessonId =
    | 'counting'
    | 'one-one'
    | 'one-two'
    | 'one-two-one'
    | 'one-two-two-one'
    | 'reduction'
    | 'in-the-wild';

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
    /** Two or three sentences opening the lesson page. */
    intro: string;
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
        intro:
            'Every number is a count of the mines touching it, and two things follow from that. If a number equals the covered cells around it, every one of them is a mine. If its mines are all accounted for, every covered cell it still touches is safe.',
    },
    {
        id: 'one-one',
        title: 'The 1-1 pattern',
        blurb: 'Two 1s along a wall, and the cell one of them cannot be counting.',
        intro:
            'Two 1s side by side with a wall behind them are usually counting the same mine. So when the second 1 can see a cell the first one cannot, that cell is safe — the mine they are both looking for is somewhere they can both see.',
    },
    {
        id: 'one-two',
        title: 'The 1-2 pattern',
        blurb: 'A 1 beside a 2 along a wall: the far cell past the 2 is always a mine.',
        intro:
            'A 1 next to a 2 along a wall is the most useful shape in the game. The 2 wants one more mine than the 1 does and sees exactly one cell the 1 cannot, so that cell is a mine every time.',
    },
    {
        id: 'one-two-one',
        title: 'The 1-2-1 pattern',
        blurb: 'Mine, safe, mine — the only arrangement that satisfies all three numbers.',
        intro:
            'A 2 flanked by two 1s has exactly one arrangement that satisfies all three numbers: mine, safe, mine. It is worth learning by sight, because it turns up constantly and needs no working out once you know it.',
    },
    {
        id: 'one-two-two-one',
        title: 'The 1-2-2-1 pattern',
        blurb: 'Safe, mine, mine, safe. The longer cousin of 1-2-1.',
        intro:
            'The longer cousin of 1-2-1, running on the same idea. The two 2s in the middle each want both of the cells only they can see, which pins the mines to the middle and leaves both ends safe.',
    },
    {
        id: 'reduction',
        title: 'Subset reduction',
        blurb: 'The general rule every pattern above is a special case of.',
        intro:
            'Every pattern in the lessons before this one is this rule wearing a costume. When one number\'s covered cells sit entirely inside another\'s, subtract the smaller from the larger: the difference between their counts tells you about exactly the cells left over. Learn it and you never have to recognise a named pattern again.',
    },

    {
        id: 'in-the-wild',
        title: 'In the wild',
        blurb: 'The same patterns, hidden in a board that looks like a real game.',
        intro:
            'Knowing a pattern and spotting one are different skills, and only the second one saves you time in a real game. These boards are bigger and busier, and the shape you need is somewhere in them \u2014 next to plenty that resembles it and is not it.',
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
        explanation:
            'The 1 touches exactly one covered cell, so that cell is the mine it is counting.',
    },
    {
        id: 'counting-b',
        lesson: 'counting',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['221', '**#'],
        solution: { flag: [[1, 0], [1, 1]], open: [[1, 2]] },
        explanation:
            'The 2 touches exactly two covered cells, so both are mines — and that satisfies the 1 beside it, leaving its last neighbour safe.',
    },
    {
        id: 'counting-c',
        lesson: 'counting',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['.11', '##*'],
        solution: { flag: [[1, 2]], open: [[1, 0], [1, 1]] },
        explanation:
            'The blank cell touches no mines at all, so the two cells under it are safe — which leaves the 1 on the right with only one candidate.',
    },
    {
        id: 'one-one-a',
        lesson: 'one-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['111', '#*#'],
        solution: { flag: [[1, 1]], open: [[1, 0], [1, 2]] },
        explanation:
            'Two 1s counting the same mine. Any cell only the second one can see is safe, because the mine it wants is already accounted for.',
    },
    {
        id: 'one-one-b',
        lesson: 'one-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1111', '*##*'],
        solution: { flag: [[1, 0], [1, 3]], open: [[1, 1], [1, 2]] },
        explanation:
            'A 1-1 at each end. Each pair settles the cell only its outer 1 can see, and the mines end up against the walls.',
    },
    {
        id: 'one-one-c',
        lesson: 'one-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1121', '#*#*'],
        solution: { flag: [[1, 1], [1, 3]], open: [[1, 0], [1, 2]] },
        explanation:
            'The 1-1 on the left frees the third cell, and the 2 then has nowhere left to put its mines but the cells that remain.',
    },
    {
        id: 'one-one-d',
        lesson: 'one-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1#', '1*', '1#'],
        solution: { flag: [[1, 1]], open: [[0, 1], [2, 1]] },
        explanation:
            'The same 1-1 rule turned on its side. The wall is to the right instead of below; nothing else changes.',
    },
    {
        id: 'one-two-a',
        lesson: 'one-two',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1211', '*#*#'],
        solution: { flag: [[1, 0], [1, 2]], open: [[1, 1], [1, 3]] },
        explanation:
            'The 2 wants one more mine than the 1 beside it, and sees exactly one cell the 1 cannot. That cell has to be a mine.',
    },
    {
        id: 'one-two-b',
        lesson: 'one-two',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['122211', '#**#*#'],
        solution: { flag: [[1, 1], [1, 2], [1, 4]], open: [[1, 0], [1, 3], [1, 5]] },
        explanation:
            'Every step along this wall outbids the number before it by one, over exactly one new cell. Each of those cells is a mine.',
    },
    {
        id: 'one-two-c',
        lesson: 'one-two',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['121211', '*#*#*#'],
        solution: { flag: [[1, 0], [1, 2], [1, 4]], open: [[1, 1], [1, 3], [1, 5]] },
        explanation:
            'Read it left to right: each 1-2 step hands you the mine past the 2, and the cell between them is safe.',
    },
    {
        id: 'one-two-d',
        lesson: 'one-two',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1*', '2#', '1*', '1#'],
        solution: { flag: [[0, 1], [2, 1]], open: [[1, 1], [3, 1]] },
        explanation:
            'The 1-2 rule against a vertical wall. The cell past the 2, away from the 1, is still the mine.',
    },
    {
        id: 'one-two-one-a',
        lesson: 'one-two-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['121', '*#*'],
        solution: { flag: [[1, 0], [1, 2]], open: [[1, 1]] },
        explanation:
            'The two 1s each want one mine and the 2 wants both. Only mine-safe-mine satisfies all three.',
    },
    {
        id: 'one-two-one-b',
        lesson: 'one-two-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['12121', '*#*#*'],
        solution: { flag: [[1, 0], [1, 2], [1, 4]], open: [[1, 1], [1, 3]] },
        explanation:
            'Two 1-2-1s overlapping. Every 2 is flanked by 1s, so the mines land under the 1s and the cells under the 2s are safe.',
    },
    {
        id: 'one-two-one-c',
        lesson: 'one-two-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1*', '2#', '1*'],
        solution: { flag: [[0, 1], [2, 1]], open: [[1, 1]] },
        explanation:
            'Mine, safe, mine — rotated. The pattern is about the numbers, not the direction they run in.',
    },
    {
        id: 'one-two-one-d',
        lesson: 'one-two-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1212121', '*#*#*#*'],
        solution: { flag: [[1, 0], [1, 2], [1, 4], [1, 6]], open: [[1, 1], [1, 3], [1, 5]] },
        explanation:
            'Four mines and three safe cells, without a single guess. Every 2 on this wall is flanked by 1s.',
    },
    {
        id: 'one-two-two-one-a',
        lesson: 'one-two-two-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1221', '#**#'],
        solution: { flag: [[1, 1], [1, 2]], open: [[1, 0], [1, 3]] },
        explanation:
            'Each 2 wants both of the cells only it can see. That forces the middle pair to be mines, which leaves the outer pair safe.',
    },
    {
        id: 'one-two-two-one-b',
        lesson: 'one-two-two-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1#', '2*', '2*', '1#'],
        solution: { flag: [[1, 1], [2, 1]], open: [[0, 1], [3, 1]] },
        explanation:
            'Safe, mine, mine, safe — turned onto a vertical wall.',
    },
    {
        id: 'one-two-two-one-c',
        lesson: 'one-two-two-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1221', '#**#', '1221'],
        solution: { flag: [[1, 1], [1, 2]], open: [[1, 0], [1, 3]] },
        explanation:
            'The pattern reads the same from above and from below, and both agree: the middle pair are the mines.',
    },
    {
        id: 'one-two-two-one-d',
        lesson: 'one-two-two-one',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['#**#', '1221', '....'],
        solution: { flag: [[0, 1], [0, 2]], open: [[0, 0], [0, 3]] },
        explanation:
            'The same pattern with the wall above instead of below. The numbers do not care which side you read them from.',
    },
    {
        id: 'reduction-a',
        lesson: 'reduction',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1#1', '1*1', '1#1'],
        solution: { flag: [[1, 1]], open: [[0, 1], [2, 1]] },
        explanation:
            'No wall here, and the rule still works. One number\'s covered cells sit inside another\'s, and the difference between their counts settles what is left over.',
    },
    {
        id: 'reduction-b',
        lesson: 'reduction',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1*1', '2#2', '1*1'],
        solution: { flag: [[0, 1], [2, 1]], open: [[1, 1]] },
        explanation:
            'The 2s see everything the 1s see and one cell more, and want one more mine. That extra cell is the answer — no named pattern required.',
    },
    {
        id: 'reduction-c',
        lesson: 'reduction',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['##1', '1*1', '1#1'],
        solution: { flag: [[1, 1]], open: [[0, 0], [0, 1], [2, 1]] },
        explanation:
            'A ragged edge, and still no guess. Compare each number against one whose covered cells it contains.',
    },
    {
        id: 'reduction-d',
        lesson: 'reduction',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['#*#', '221', '*1.'],
        solution: { flag: [[0, 1], [2, 0]], open: [[0, 0], [0, 2]] },
        explanation:
            'Take the smaller set of cells away from the larger one and read what is left. That is the whole rule.',
    },
    {
        id: 'reduction-e',
        lesson: 'reduction',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['#1#', '*1.', '#1.'],
        solution: { flag: [[1, 0]], open: [[0, 0], [0, 2], [2, 0]] },
        explanation:
            'Every pattern in this lesson is this one rule wearing a different shape.',
    },
    {
        id: 'in-the-wild-a',
        lesson: 'in-the-wild',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['.1221.', '13**1.', '1**##.', '12##1.', '..1*1.', '..1#1.'],
        solution: { flag: [[1, 2], [1, 3], [2, 1], [2, 2], [4, 3]], open: [[2, 3], [2, 4], [3, 2], [3, 3], [5, 3]] },
        explanation:
            'A 1-2-2-1 runs along the top row, and you will need it: counting alone does not finish this board.',
    },
    {
        id: 'in-the-wild-b',
        lesson: 'in-the-wild',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1#1....', '#*#....', '2*#11..', '112*1..', '..111..', '..11211', '..1*#*1'],
        solution: { flag: [[1, 1], [2, 1], [3, 3], [6, 3], [6, 5]], open: [[0, 1], [1, 0], [1, 2], [2, 2], [6, 4]] },
        explanation:
            'There is a 1-2-1 low on the board. The loose 1s scattered elsewhere are the noise you have to see past.',
    },
    {
        id: 'in-the-wild-c',
        lesson: 'in-the-wild',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['.1***1', '.2#4#1', '13*31.', '1***1.', '12321.', '......'],
        solution: { flag: [[0, 2], [0, 3], [0, 4], [2, 2], [3, 1], [3, 2], [3, 3]], open: [[1, 2], [1, 4]] },
        explanation:
            'A 1 beside a 2 near the bottom is the way in. The 4 looks like the hard part and never is.',
    },
    {
        id: 'in-the-wild-d',
        lesson: 'in-the-wild',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['...111', '...1*2', '..#1#*', '111#2#', '#*11*1', '1111#1'],
        solution: { flag: [[1, 4], [2, 5], [4, 1], [4, 4]], open: [[2, 2], [2, 4], [3, 3], [3, 5], [4, 0], [5, 4]] },
        explanation:
            'The 1 and 2 at the top of the right-hand column are a 1-2 like any other, only read downwards.',
    },
    {
        id: 'in-the-wild-e',
        lesson: 'in-the-wild',
        prompt: 'Flag every mine and open every safe cell you can prove.',
        layout: ['1#321.', '#***1.', '14*#1.', '.2*211', '.1111*', '....11', '......'],
        solution: { flag: [[1, 1], [1, 2], [1, 3], [2, 2], [3, 2], [4, 5]], open: [[0, 1], [1, 0], [2, 3]] },
        explanation:
            'Several 1-1 pairs sit low on the board. They are what plain counting cannot do for you here.',
    },
];

export const drillsForLesson = (lesson: LessonId): Drill[] =>
    DRILLS.filter((d) => d.lesson === lesson);
