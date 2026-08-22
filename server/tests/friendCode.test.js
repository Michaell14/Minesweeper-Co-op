/**
 * Friend codes — the pure half. The alphabet is the whole point: a code is
 * read off one screen and typed into somebody else's box, so the symbols a
 * person mis-copies are absent, and what "normalising" does and does NOT do
 * follows from that.
 */

const {
    ALPHABET,
    CODE_LENGTH,
    generateFriendCode,
    normalizeFriendCode,
    isFriendCodeShape,
    isValidFriendCode,
} = require('../domain/friendCode');

describe('the alphabet', () => {
    // O/0 and I/1 are the four a person confuses when copying by hand.
    test.each(['O', '0', 'I', '1'])('omits %s', (ch) => {
        expect(ALPHABET).not.toContain(ch);
    });

    test('has no duplicates', () => {
        expect(new Set(ALPHABET).size).toBe(ALPHABET.length);
    });

    // 8 symbols over 32 is 40 bits. Not a secret — but not walkable either,
    // which is what lets the lookup answer honestly with a 404.
    test('is 32 symbols, giving 40 bits over 8 characters', () => {
        expect(ALPHABET.length).toBe(32);
        expect(CODE_LENGTH).toBe(8);
    });
});

describe('generateFriendCode', () => {
    const codes = Array.from({ length: 2000 }, generateFriendCode);

    test('always produces a valid code', () => {
        expect(codes.every(isFriendCodeShape)).toBe(true);
    });

    // Not a randomness test — a stuck generator handing back one value would
    // make every account's code the same, and that is worth one assertion.
    test('does not repeat itself', () => {
        expect(new Set(codes).size).toBe(codes.length);
    });

    test('uses the whole alphabet, not a corner of it', () => {
        const seen = new Set(codes.join(''));
        expect(seen.size).toBe(ALPHABET.length);
    });
});

describe('normalizeFriendCode', () => {
    test.each([
        ['abc23xyz', 'ABC23XYZ'],
        ['  ABC23XYZ  ', 'ABC23XYZ'],
        ['AbC23xYz', 'ABC23XYZ'],
    ])('%p → %p', (input, expected) => {
        expect(normalizeFriendCode(input)).toBe(expected);
    });

    test.each([[null], [undefined], [42], [{}]])('%p normalises to the empty string', (input) => {
        expect(normalizeFriendCode(input)).toBe('');
    });

    /*
     * The one thing it must NOT do. O and I are not in the alphabet, so a code
     * containing them is a typo — "helpfully" mapping them to 0 and 1 would
     * turn a typo into a lookup for somebody else's account.
     */
    test('does not repair a mistyped O or I into 0 or 1', () => {
        expect(isValidFriendCode('ABCO12XY')).toBe(false);
        expect(isValidFriendCode('ABCI23XY')).toBe(false);
    });
});

describe('isValidFriendCode', () => {
    test('accepts a generated code, however it was typed', () => {
        const code = generateFriendCode();
        expect(isValidFriendCode(code)).toBe(true);
        expect(isValidFriendCode(code.toLowerCase())).toBe(true);
        expect(isValidFriendCode(`  ${code} `)).toBe(true);
    });

    test.each([
        ['too short', 'ABC23X'],
        ['too long', 'ABC23XYZQ'],
        ['a symbol outside the alphabet', 'ABC23XY!'],
        ['the empty string', ''],
        ['a number', 12345678],
        ['null', null],
        ['undefined', undefined],
    ])('rejects %s', (_label, value) => {
        expect(isValidFriendCode(value)).toBe(false);
    });
});
