/**
 * The seam between two shared catalogs.
 *
 * `shared/avatars.js` names achievements from `shared/achievements.js` by id,
 * and neither file can see the other. A typo'd or retired id makes an avatar
 * permanently unearnable — the gate asks for something nobody can ever hold —
 * and nothing else in the suite would notice, because every OTHER check on
 * these two files passes with the string being nonsense.
 */
const { AVATARS, DEFAULT_AVATAR, canUseAvatar, requirementFor } = require('../../shared/avatars');
const { ACHIEVEMENTS } = require('../../shared/achievements');

const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);
const gated = AVATARS.filter((a) => a.requires);

describe('what the earned avatars ask for', () => {
    test('there are some — this catalog is not all free', () => {
        expect(gated.length).toBeGreaterThan(0);
    });

    test.each(gated.map((a) => [a.id, a.requires]))(
        '%s asks for %s, which exists',
        (_id, requires) => {
            expect(ACHIEVEMENT_IDS).toContain(requires);
        },
    );

    // A hidden achievement is one whose description the shelf withholds until
    // it is earned, so gating a VISIBLE card on one leaves a lock with nothing
    // legible to do about it. Allowed eventually — but it needs its own "???"
    // treatment in the picker first, and this fails until someone builds it.
    test.each(gated.map((a) => [a.id, a.requires]))(
        '%s does not hide its requirement behind a hidden achievement',
        (_id, requires) => {
            const achievement = ACHIEVEMENTS.find((a) => a.id === requires);
            expect(achievement.hidden).toBe(false);
        },
    );

    test('the default avatar is free — nobody starts locked out of themselves', () => {
        expect(requirementFor(DEFAULT_AVATAR)).toBeNull();
    });
});

describe('canUseAvatar', () => {
    const earnedNothing = { earned: [], current: 'classic' };

    test('an ungated avatar needs nothing', () => {
        expect(canUseAvatar('fox', earnedNothing)).toBe(true);
    });

    test('a gated one is refused without its achievement', () => {
        expect(canUseAvatar('shark', earnedNothing)).toBe(false);
    });

    test('and allowed with it', () => {
        expect(canUseAvatar('shark', { earned: ['apex-predator'], current: 'classic' })).toBe(true);
    });

    test('the one you are already wearing is always yours', () => {
        expect(canUseAvatar('shark', { earned: [], current: 'shark' })).toBe(true);
    });

    test('an unrelated achievement does not open it', () => {
        expect(canUseAvatar('shark', { earned: ['first-clear'], current: 'classic' })).toBe(false);
    });

    // Called with nothing at all by anywhere that has no account context.
    test('defaults to the strictest answer', () => {
        expect(canUseAvatar('shark')).toBe(false);
        expect(canUseAvatar('fox')).toBe(true);
    });
});
