import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import burst from "canvas-confetti";
import { useMinesweeperStore } from "@/app/store";
import { shootConfetti } from "./confetti";

/**
 * The burst's two gates: reduced motion and the confetti setting. The library
 * arrives asynchronously, so a gate read only before it loads would let a
 * burst through after the player switched it off. Nothing fails loudly when
 * that happens; the motion just plays for someone who asked for none.
 */

vi.mock("canvas-confetti", () => ({ default: vi.fn(() => null) }));

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/lib/motion", () => ({ prefersReducedMotion: () => motion.reduced }));

const setConfetti = (confetti: boolean) =>
    useMinesweeperStore.setState((state) => ({ settings: { ...state.settings, confetti } }));

/** Long enough for the library to load and the burst to be decided. */
const settle = async () => {
    await import("canvas-confetti");
    await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
    motion.reduced = false;
    setConfetti(true);
});

afterEach(() => vi.mocked(burst).mockClear());

describe("shootConfetti", () => {
    test("bursts once the library has loaded", async () => {
        shootConfetti();
        await settle();
        expect(burst).toHaveBeenCalledOnce();
    });

    test("does nothing with the setting off", async () => {
        setConfetti(false);
        shootConfetti();
        await settle();
        expect(burst).not.toHaveBeenCalled();
    });

    test("does nothing under reduced motion", async () => {
        motion.reduced = true;
        shootConfetti();
        await settle();
        expect(burst).not.toHaveBeenCalled();
    });

    test("drops a burst whose setting was switched off while it loaded", async () => {
        shootConfetti();
        setConfetti(false);
        await settle();
        expect(burst).not.toHaveBeenCalled();
    });

    test("drops a burst when reduced motion came on while it loaded", async () => {
        shootConfetti();
        motion.reduced = true;
        await settle();
        expect(burst).not.toHaveBeenCalled();
    });
});
