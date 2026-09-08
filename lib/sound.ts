/**
 * Sound effects synthesised with the Web Audio API at play time. NO audio
 * files: a few oscillators with fast envelopes keep the repo asset-free and
 * every sound editable as numbers. OFF BY DEFAULT (`settings.sound`); every
 * play re-reads the store, so the gate lives here and call sites stay
 * one-liners, as in lib/confetti.ts. Browsers allow an AudioContext only after
 * a user gesture, so `installSoundUnlock` resumes it on the first one for
 * plays that are not clicks (a teammate's cascade, a server-decided win). A
 * play that finds the context suspended is dropped, never queued.
 */

import { useMinesweeperStore } from '@/app/store';

export type SoundName = 'reveal' | 'flag' | 'unflag' | 'chord' | 'cascade' | 'win' | 'lose' | 'emote';

/** Keeps full volume comfortable; the user slider scales inside this. */
const MASTER_SCALE = 0.22;

let ctx: AudioContext | null = null;

const getContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
};

interface Blip {
    /** Start frequency, Hz. */
    freq: number;
    /** Glide target: the up-chirp of a flag, the down-buzz of a loss. */
    slideTo?: number;
    /** Offset into the sound, seconds. */
    at: number;
    duration: number;
    type?: OscillatorType;
}

/** The sounds, as data. Pitches lean on the C-major arpeggio; random ones read as error beeps. */
const SOUNDS: Record<SoundName, Blip[]> = {
    reveal: [{ freq: 660, at: 0, duration: 0.045 }],
    flag: [{ freq: 880, slideTo: 1320, at: 0, duration: 0.07 }],
    unflag: [{ freq: 880, slideTo: 550, at: 0, duration: 0.07 }],
    chord: [
        { freq: 550, at: 0, duration: 0.05 },
        { freq: 733, at: 0.05, duration: 0.05 },
    ],
    cascade: [523, 659, 784, 1047].map((freq, i) => ({
        freq,
        at: i * 0.045,
        duration: 0.06,
        type: 'triangle' as OscillatorType,
    })),
    win: [523, 659, 784, 1047, 1319].map((freq, i) => ({
        freq,
        at: i * 0.09,
        duration: i === 4 ? 0.28 : 0.09,
    })),
    lose: [{ freq: 220, slideTo: 55, at: 0, duration: 0.45, type: 'sawtooth' }],
    /* Quiet and quick: fires for other people's messages, so it must not compete with your click. */
    emote: [
        { freq: 784, at: 0, duration: 0.05, type: 'triangle' },
        { freq: 1047, at: 0.05, duration: 0.07, type: 'triangle' },
    ],
};

const scheduleBlip = (audio: AudioContext, out: GainNode, blip: Blip) => {
    const start = audio.currentTime + blip.at;
    const osc = audio.createOscillator();
    osc.type = blip.type ?? 'square';
    osc.frequency.setValueAtTime(blip.freq, start);
    if (blip.slideTo) {
        osc.frequency.exponentialRampToValueAtTime(blip.slideTo, start + blip.duration);
    }

    // Fast attack, exponential decay: the "8-bit" envelope.
    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(1, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + blip.duration);

    osc.connect(envelope);
    envelope.connect(out);
    osc.start(start);
    osc.stop(start + blip.duration + 0.02);
    osc.onended = () => envelope.disconnect();
};

/** Plays one effect, subject to the settings gate. Never throws. */
export function playSound(name: SoundName): void {
    const { settings } = useMinesweeperStore.getState();
    if (!settings.sound || settings.soundVolume <= 0) return;
    // A background tab still receives socket events; it should not beep.
    if (typeof document !== 'undefined' && document.hidden) return;

    const audio = getContext();
    if (!audio) return;
    if (audio.state === 'suspended') {
        // Try, but never wait: a refused play is dropped, not queued to fire stale.
        void audio.resume();
        if ((audio.state as string) === 'suspended') return;
    }

    try {
        const master = audio.createGain();
        master.gain.value = settings.soundVolume * MASTER_SCALE;
        master.connect(audio.destination);
        for (const blip of SOUNDS[name]) scheduleBlip(audio, master, blip);
    } catch {
        // An exotic Web Audio failure loses a blip, never a move.
    }
}

/**
 * Resumes the context on the first user gesture so sounds NOT inside a click
 * are audible. Listeners remove themselves once running. Idempotent.
 */
export function installSoundUnlock(): void {
    if (typeof window === 'undefined') return;

    const unlock = () => {
        const audio = getContext();
        if (!audio) {
            remove();
            return;
        }
        void audio.resume().then(() => {
            if (audio.state === 'running') remove();
        });
    };
    const remove = () => {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
}

/** Test seam: drops the cached context so a fresh fake can be installed. */
export function resetSoundForTests(): void {
    ctx = null;
}
