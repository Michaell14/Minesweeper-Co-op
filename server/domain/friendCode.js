/**
 * Friend codes: the handle you give somebody so they can add you. A CODE
 * rather than a name search: display names are not unique and there are no
 * public profiles (USER_PROFILES_PRD.md), and a search would add enumeration
 * and a harassment surface. Pure — `randomBytes` is the one dependency.
 */

const { randomBytes } = require('crypto');

/** 32 symbols, minus the ones a human mis-copies (O/0, I/1): this is read off a screen and typed. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 8 symbols over 32 is 40 bits — not a secret, but not walkable either. */
const CODE_LENGTH = 8;

const PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/**
 * A fresh code. The modulo is unbiased only because 256 byte values divide
 * evenly by the 32-symbol alphabet; another size would need rejection sampling.
 */
const generateFriendCode = () => {
    const bytes = randomBytes(CODE_LENGTH);
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[bytes[i] % ALPHABET.length];
    return code;
};

/**
 * What a typed code means: case-insensitive, surrounding space dropped. NOT
 * mapping O→0 or I→1: those are absent from the alphabet, so a code with one
 * is a typo, and "fixing" it could land on somebody else's account.
 */
const normalizeFriendCode = (code) =>
    typeof code === 'string' ? code.trim().toUpperCase() : '';

/** Whether a NORMALISED code could exist. Shape only — the table decides. */
const isFriendCodeShape = (code) => typeof code === 'string' && PATTERN.test(code);

/**
 * A code as TYPED: normalised, then shape-checked. Lives HERE, not in
 * validation.js: that sits below domain/ in the layer order
 * (tests/layering.test.js), and splitting the pattern from the alphabet would
 * leave two copies of the same 32 symbols to drift.
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
