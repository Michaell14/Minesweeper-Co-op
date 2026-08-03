/**
 * Bridge-token verification. The Next app signs these (app/api/socket-token);
 * this side must accept exactly what that route mints and nothing else. Every
 * rejection is `null`, never a throw — a bad token is an anonymous player.
 */

const jwt = require('jsonwebtoken');

const SECRET = 'test-bridge-secret';

/** Loads authToken with a chosen AUTH_BRIDGE_SECRET baked into config. */
const loadWithSecret = (secret) => {
    let mod;
    const prev = process.env.AUTH_BRIDGE_SECRET;
    jest.isolateModules(() => {
        if (secret === undefined) delete process.env.AUTH_BRIDGE_SECRET;
        else process.env.AUTH_BRIDGE_SECRET = secret;
        try {
            mod = require('../utils/authToken');
        } finally {
            if (prev === undefined) delete process.env.AUTH_BRIDGE_SECRET;
            else process.env.AUTH_BRIDGE_SECRET = prev;
        }
    });
    return mod;
};

/** A token exactly as app/api/socket-token/route.ts mints it. */
const mint = (claims = {}, options = {}) =>
    jwt.sign(
        {
            provider: 'github',
            providerAccountId: '42',
            email: 'm@example.com',
            name: 'Michael',
            ...claims,
        },
        options.secret || SECRET,
        {
            algorithm: 'HS256',
            issuer: options.issuer || 'minesweeper-web',
            audience: options.audience || 'minesweeper-server',
            expiresIn: options.expiresIn || '1h',
        },
    );

describe('with the secret configured', () => {
    const { verifyBridgeToken } = loadWithSecret(SECRET);

    test('accepts a well-formed token and returns the identity', () => {
        expect(verifyBridgeToken(mint())).toEqual({
            provider: 'github',
            providerAccountId: '42',
            email: 'm@example.com',
            name: 'Michael',
        });
    });

    test('normalises optional claims: missing email and blank name become null', () => {
        const token = jwt.sign(
            { provider: 'google', providerAccountId: '7', name: '   ' },
            SECRET,
            { algorithm: 'HS256', issuer: 'minesweeper-web', audience: 'minesweeper-server', expiresIn: '1h' },
        );
        expect(verifyBridgeToken(token)).toEqual({
            provider: 'google',
            providerAccountId: '7',
            email: null,
            name: null,
        });
    });

    test.each([
        ['expired', () => mint({}, { expiresIn: '-1s' })],
        ['signed with another secret', () => mint({}, { secret: 'wrong' })],
        ['wrong issuer', () => mint({}, { issuer: 'someone-else' })],
        ['wrong audience', () => mint({}, { audience: 'other-service' })],
        ['missing the identity pair', () => jwt.sign({ email: 'm@example.com' }, SECRET, {
            algorithm: 'HS256', issuer: 'minesweeper-web', audience: 'minesweeper-server', expiresIn: '1h',
        })],
        // alg:none and its relatives — jwt.verify pins HS256, but the case is
        // cheap to keep on record.
        ['unsigned', () => `${mint().split('.').slice(0, 2).join('.')}.`],
        ['garbage', () => 'not-a-jwt'],
    ])('rejects a token that is %s', (_label, make) => {
        expect(verifyBridgeToken(make())).toBeNull();
    });

    test.each([[''], [null], [undefined], [12345]])('rejects non-token input %p', (input) => {
        expect(verifyBridgeToken(input)).toBeNull();
    });
});

describe('without the secret configured', () => {
    test('every token is rejected — there is no default secret to guess', () => {
        const { verifyBridgeToken } = loadWithSecret(undefined);
        expect(verifyBridgeToken(mint())).toBeNull();
    });
});
