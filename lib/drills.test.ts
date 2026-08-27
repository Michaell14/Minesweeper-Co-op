/** The catalog is only as good as the checker run over it. */

import { describe, expect, test } from 'vitest';
import { DRILLS, drillsForLesson } from './drills';
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
