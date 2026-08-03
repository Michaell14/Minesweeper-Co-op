// @vitest-environment jsdom
/**
 * The sound engine's GATES — the part that fails silently in both directions:
 * a beep from a player who never opted in, or an opted-in player hearing
 * nothing. The synthesis itself is exercised against a fake AudioContext that
 * records scheduling, since jsdom ships no Web Audio at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playSound, resetSoundForTests } from './sound';
import { useMinesweeperStore } from '@/app/store';
import { DEFAULT_SETTINGS } from './settings';

/** Records what the engine schedules; no audio anywhere. */
class FakeOscillator {
    type = 'sine';
    started = false;
    frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
    onended: (() => void) | null = null;
    connect = vi.fn();
    start = vi.fn(() => { this.started = true; });
    stop = vi.fn();
}

class FakeGain {
    gain = {
        value: 1,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
    };
    connect = vi.fn();
    disconnect = vi.fn();
}

class FakeAudioContext {
    static instances: FakeAudioContext[] = [];
    state = 'running';
    currentTime = 0;
    destination = {};
    oscillators: FakeOscillator[] = [];
    gains: FakeGain[] = [];
    constructor() { FakeAudioContext.instances.push(this); }
    createOscillator() { const o = new FakeOscillator(); this.oscillators.push(o); return o; }
    createGain() { const g = new FakeGain(); this.gains.push(g); return g; }
    resume = vi.fn(async () => { this.state = 'running'; });
}

const setSoundSettings = (sound: boolean, soundVolume: number) =>
    useMinesweeperStore.setState((s) => ({
        settings: { ...s.settings, sound, soundVolume },
    }));

beforeEach(() => {
    FakeAudioContext.instances = [];
    resetSoundForTests();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    useMinesweeperStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('the opt-in gate', () => {
    it('does nothing by default — sound ships OFF', () => {
        playSound('reveal');
        expect(FakeAudioContext.instances).toHaveLength(0);
    });

    it('does nothing at volume zero even when enabled', () => {
        setSoundSettings(true, 0);
        playSound('reveal');
        expect(FakeAudioContext.instances).toHaveLength(0);
    });

    it('plays when enabled, scaling the master gain by the volume setting', () => {
        setSoundSettings(true, 0.5);
        playSound('reveal');

        const [ctx] = FakeAudioContext.instances;
        expect(ctx.oscillators.length).toBeGreaterThan(0);
        expect(ctx.oscillators.every((o) => o.started)).toBe(true);
        // First gain is the per-play master: volume * the internal ceiling.
        expect(ctx.gains[0].gain.value).toBeCloseTo(0.5 * 0.22);
        expect(ctx.gains[0].connect).toHaveBeenCalledWith(ctx.destination);
    });

    it('schedules one oscillator per blip of the sound', () => {
        setSoundSettings(true, 1);
        playSound('win'); // five-note fanfare
        expect(FakeAudioContext.instances[0].oscillators).toHaveLength(5);
    });
});

describe('environment gates', () => {
    it('stays silent in a background tab — socket events still arrive there', () => {
        setSoundSettings(true, 1);
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        playSound('reveal');
        expect(FakeAudioContext.instances).toHaveLength(0);
        hidden.mockRestore();
    });

    it('drops a play the browser refuses to unlock, instead of queuing it', () => {
        setSoundSettings(true, 1);
        vi.stubGlobal(
            'AudioContext',
            class extends FakeAudioContext {
                state = 'suspended';
                resume = vi.fn(async () => {}); // refuses: stays suspended
            },
        );
        playSound('reveal');
        const [ctx] = FakeAudioContext.instances;
        expect(ctx.resume).toHaveBeenCalled();
        expect(ctx.oscillators).toHaveLength(0);
    });

    it('survives a browser with no Web Audio at all', () => {
        setSoundSettings(true, 1);
        vi.unstubAllGlobals();
        expect(() => playSound('reveal')).not.toThrow();
    });

    it('reuses one context across plays', () => {
        setSoundSettings(true, 1);
        playSound('reveal');
        playSound('flag');
        expect(FakeAudioContext.instances).toHaveLength(1);
    });
});
