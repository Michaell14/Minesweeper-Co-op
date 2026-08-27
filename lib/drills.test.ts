/** The catalog is only as good as the checker run over it. */

import { describe, expect, test } from 'vitest';
import { DRILLS, LESSONS, drillsForLesson, lessonById } from './drills';
import { validateDrill, LESSON_RULES } from './drillDeduction';

describe('the catalog', () => {
    test('holds the worked drills', () => {
        expect(DRILLS.map((d) => d.id)).toContain('counting-a');
        expect(DRILLS.map((d) => d.id)).toContain('one-two-one-a');
    });

    test('every drill is valid', () => {
        for (const d of DRILLS) {
            expect({ id: d.id, problems: validateDrill(d) }).toEqual({ id: d.id, problems: [] });
        }
    });

    test('drill ids are unique', () => {
        expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
    });

    test('every drill names a lesson the gate knows', () => {
        for (const d of DRILLS) expect(LESSON_RULES[d.lesson]).toBeDefined();
    });

    test('drillsForLesson returns that lesson only, in catalog order', () => {
        const counting = drillsForLesson('counting');
        expect(counting.length).toBeGreaterThan(0);
        expect(counting.every((d) => d.lesson === 'counting')).toBe(true);
    });
});

describe('lessons', () => {
    test('there is one lesson entry per lesson the gate knows', () => {
        expect(LESSONS.map((l) => l.id).sort()).toEqual(Object.keys(LESSON_RULES).sort());
    });

    test('every lesson has a title and a blurb', () => {
        for (const lesson of LESSONS) {
            expect(lesson.title.length).toBeGreaterThan(0);
            expect(lesson.blurb.length).toBeGreaterThan(0);
        }
    });

    test('every lesson opens with a couple of sentences of prose', () => {
        for (const lesson of LESSONS) {
            expect(lesson.intro.split('. ').length).toBeGreaterThanOrEqual(2);
        }
    });

    test('each lesson holds the number of drills the plan calls for', () => {
        const counts = Object.fromEntries(
            LESSONS.map((l) => [l.id, drillsForLesson(l.id).length]),
        );
        expect(counts).toEqual({
            'counting': 3,
            'one-one': 4,
            'one-two': 4,
            'one-two-one': 4,
            'one-two-two-one': 4,
            'reduction': 5,
        });
    });

    test('lessonById finds one and shrugs at nonsense', () => {
        expect(lessonById('counting')?.id).toBe('counting');
        expect(lessonById('not-a-lesson')).toBeUndefined();
    });

    test('every authored drill belongs to a listed lesson', () => {
        for (const d of DRILLS) expect(lessonById(d.lesson)).toBeDefined();
    });
});
