// @vitest-environment jsdom
/**
 * The bridge-token cache. What matters: one mint per validity window however
 * many callers ask, a single in-flight fetch under concurrency, and null —
 * never a throw — for every "anonymous" outcome, because a throw here would
 * take the socket's auth callback down with it.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getBridgeToken, clearBridgeToken } from './authBridge';

const okResponse = (token: string, ttlMs = 60 * 60 * 1000) => ({
    ok: true,
    json: async () => ({ token, expiresAt: Date.now() + ttlMs }),
});

beforeEach(() => {
    clearBridgeToken();
    vi.unstubAllGlobals();
});

describe('getBridgeToken', () => {
    it('fetches once and serves the cache until expiry approaches', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse('tok-1'));
        vi.stubGlobal('fetch', fetchMock);

        expect(await getBridgeToken()).toBe('tok-1');
        expect(await getBridgeToken()).toBe('tok-1');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('shares one in-flight fetch between concurrent callers', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okResponse('tok-1'));
        vi.stubGlobal('fetch', fetchMock);

        const [a, b] = await Promise.all([getBridgeToken(), getBridgeToken()]);
        expect(a).toBe('tok-1');
        expect(b).toBe('tok-1');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('refreshes a token already inside the safety margin', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(okResponse('tok-short', 60 * 1000)) // < 5 min margin
            .mockResolvedValueOnce(okResponse('tok-fresh'));
        vi.stubGlobal('fetch', fetchMock);

        expect(await getBridgeToken()).toBe('tok-short');
        expect(await getBridgeToken()).toBe('tok-fresh');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['signed out (401)', { ok: false, status: 401, json: async () => ({}) }],
        ['bridge unconfigured (503)', { ok: false, status: 503, json: async () => ({}) }],
        ['a malformed body', { ok: true, json: async () => ({ nope: true }) }],
    ])('answers null for %s', async (_label, response) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
        expect(await getBridgeToken()).toBeNull();
    });

    it('answers null on network failure rather than throwing', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        await expect(getBridgeToken()).resolves.toBeNull();
    });

    it('does not cache a failure — the next call tries again', async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(okResponse('tok-1'));
        vi.stubGlobal('fetch', fetchMock);

        expect(await getBridgeToken()).toBeNull();
        expect(await getBridgeToken()).toBe('tok-1');
    });

    it('clearBridgeToken forces a fresh mint', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(okResponse('tok-1'))
            .mockResolvedValueOnce(okResponse('tok-2'));
        vi.stubGlobal('fetch', fetchMock);

        expect(await getBridgeToken()).toBe('tok-1');
        clearBridgeToken();
        expect(await getBridgeToken()).toBe('tok-2');
    });
});
