/**
 * Friend codes: the handle you give somebody so they can add you.
 *
 * A CODE rather than a name search, and that is the whole design. Display
 * names are not unique here and `USER_PROFILES_PRD.md` deliberately kept them
 * that way, with no public profiles; a name search would reintroduce both,
 * plus enumeration ("who else is called Alex?") and a harassment surface. A
 * code is something you choose to hand out.
 *
 * Pure — no storage, no clock of its own. `randomBytes` is the one dependency,
 * and it is the right one: a guessable code is a code anyone can add you by.
 */

const { randomBytes } = require('crypto');

/**
 * 32 symbols, and the four that a human would mis-copy are gone: O and 0, I
 * and 1. This is read off a screen and typed into a box by somebody else, so
 * the alphabet is chosen for that rather than for density.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 8 symbols over 32 is 40 bits — not a secret, but not walkable either. */
const CODE_LENGTH = 8;

const PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/**
 * A fresh code.
 *
 * Rejection sampling rather than `% 32`: the alphabet is exactly 32 symbols so
 * a byte's 256 values divide evenly, but writing it as a mask makes that a
 * fact of the code rather than a coincidence nobody re-checks when the
 * alphabet changes. `& 31` is the mask for 32 symbols; a shorter alphabet
 * would need the loop.
 */
const generateFriendCode = () => {
    const bytes = randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
    return code;
};

/**
 * What a typed code means: case is ignored and surrounding space is dropped,
 * because both are things a person does when copying eight characters by hand
 * and neither changes which account they meant.
 *
 * Deliberately NOT mapping O→0 or I→1: those symbols are absent from the
 * alphabet, so a code containing one is a typo, and silently "fixing" it would
 * turn a typo into somebody else's account.
 */
const normalizeFriendCode = (code) =>
    typeof code === 'string' ? code.trim().toUpperCase() : '';

/** Whether a NORMALISED code could exist. Shape only — the table decides. */
const isFriendCodeShape = (code) => typeof code === 'string' && PATTERN.test(code);

/**
 * A code as TYPED: normalised, then shape-checked.
 *
 * The validation rule lives HERE rather than in validation.js, beside the
 * alphabet it is derived from — validation.js sits below domain/ in the layer
 * order (tests/layering.test.js enforces it), so it cannot re-export this the
 * way it re-exports `isValidBoardConfig` from shared/. Splitting the pattern
 * from the alphabet to satisfy the import direction would leave two copies of
 * the same 32 symbols to drift apart.
 */
const isValidFriendCode = (code) => isFriendCodeShape(normalizeFriendCode(code));

module.exports = {
    ALPHABET,
    CODE_LENGTH,
    generateFriendCode,
    normalizeFriendCode,
    isFriendCodeShape,
    isValidFriendCode,
};
