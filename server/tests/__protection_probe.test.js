/**
 * TEMPORARY — deliberately failing, to prove branch protection blocks a merge
 * when CI is red. This file and its branch are deleted immediately after.
 */
test('this assertion fails on purpose', () => {
    expect('branch protection').toBe('verified by a real run, not a dry run');
});
