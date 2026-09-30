// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsSync from './SettingsSync';
import { useMinesweeperStore } from '@/app/store';
import { DEFAULT_SETTINGS, writeStoredSettings } from '@/lib/settings';

vi.mock('next-auth/react', () => ({
    useSession: () => ({ status: 'authenticated' }),
}));
vi.mock('@/lib/authBridge', () => ({ getBridgeToken: async () => 'test-token' }));
vi.mock('@/lib/initSocket', () => ({ serverURL: 'https://settings.test' }));
vi.mock('@/lib/themesApi', () => ({
    fetchThemes: async () => null,
    saveThemeRemote: async () => true,
    deleteThemeRemote: async () => true,
}));
vi.mock('@/lib/sound', () => ({ installSoundUnlock: vi.fn() }));

const response = (data: unknown, ok = true) => ({ ok, json: async () => data });
const fetchMock = vi.fn();
const local = { ...DEFAULT_SETTINGS, seasonalThemes: false, theme: 'dark' };

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    localStorage.clear();
    writeStoredSettings(local);
    useMinesweeperStore.setState({ settings: local, customThemes: [], settingsHydrated: false });
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const mount = async () => {
    await act(async () => { render(<SettingsSync />); });
};

const editAndWait = async () => {
    await act(async () => {
        useMinesweeperStore.getState().setSetting('sound', true);
        await vi.advanceTimersByTimeAsync(1000);
    });
};

describe('settings account baseline', () => {
    it.each([
        ['a failed response', async () => response(null, false)],
        ['a network failure', async () => { throw new Error('offline'); }],
        ['malformed JSON', async () => ({ ok: true, json: async () => { throw new Error('bad JSON'); } })],
        ['a missing settings field', async () => response({})],
        ['an invalid settings field', async () => response({ settings: 'invalid' })],
    ])('never uploads local preferences after %s, including later edits', async (_name, get) => {
        fetchMock.mockImplementationOnce(get).mockResolvedValue(response(null));
        await mount();
        await editAndWait();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].method).toBe('GET');
        expect(useMinesweeperStore.getState().settings.sound).toBe(true);
        expect(useMinesweeperStore.getState().settings.theme).toBe('dark');
    });

    it('waits for the read before allowing an upload', async () => {
        let resolveRead!: (value: ReturnType<typeof response>) => void;
        fetchMock.mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
        await mount();
        await editAndWait();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await act(async () => { resolveRead(response({ settings: { ...local, sound: false } })); });
        expect(useMinesweeperStore.getState().settings.sound).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('seeds a successfully loaded empty account with the browser preferences', async () => {
        fetchMock.mockResolvedValueOnce(response({ settings: null })).mockResolvedValue(response(null));
        await mount();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ settings: local });
    });

    it('loads the account preferences without echoing them, then saves subsequent edits', async () => {
        const server = { ...local, theme: 'amber' };
        fetchMock.mockResolvedValueOnce(response({ settings: server })).mockResolvedValue(response(null));
        await mount();
        expect(useMinesweeperStore.getState().settings).toEqual(server);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await editAndWait();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ settings: { ...server, sound: true } });
    });
});
