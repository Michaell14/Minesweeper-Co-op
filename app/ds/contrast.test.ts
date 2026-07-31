import { describe, expect, it } from "vitest";
import { AA_LARGE, AA_NORMAL, contrastRatio, luminance, type Rgb } from "./contrast";

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
/** The canonical grey that lands exactly on the AA boundary against white. */
const AA_BOUNDARY_GREY: Rgb = [118, 118, 118];

describe("luminance", () => {
    it("anchors at 0 for black and 1 for white", () => {
        expect(luminance(BLACK)).toBe(0);
        expect(luminance(WHITE)).toBe(1);
    });

    it("weights green most and blue least, per WCAG", () => {
        const [r, g, b] = [
            luminance([255, 0, 0]),
            luminance([0, 255, 0]),
            luminance([0, 0, 255]),
        ];
        expect(g).toBeGreaterThan(r);
        expect(r).toBeGreaterThan(b);
        expect(g).toBeCloseTo(0.7152, 4);
    });

    it("uses the linear segment below the 0.03928 threshold", () => {
        // 10/255 = 0.0392 — just under the knee, so it divides rather than powers.
        expect(luminance([10, 10, 10])).toBeCloseTo(10 / 255 / 12.92, 6);
    });
});

describe("contrastRatio", () => {
    it("returns 21:1 for black on white", () => {
        expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 2);
    });

    it("returns 1:1 for a colour against itself", () => {
        expect(contrastRatio(AA_BOUNDARY_GREY, AA_BOUNDARY_GREY)).toBeCloseTo(1, 5);
    });

    it("is order-independent", () => {
        expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(contrastRatio(WHITE, BLACK), 10);
    });

    it("puts #767676 on white exactly at the AA boundary", () => {
        // The reference value the WCAG contrast examples are calibrated on: if
        // this drifts, every number the audit reports is wrong.
        expect(contrastRatio(AA_BOUNDARY_GREY, WHITE)).toBeCloseTo(4.54, 2);
    });

    it("matches known ratios from the app's own palette", () => {
        // White on NES success green — the failure the audit reports today.
        expect(contrastRatio(WHITE, [146, 204, 65])).toBeCloseTo(1.92, 2);
        // Near-black body ink on white.
        expect(contrastRatio([33, 37, 41], WHITE)).toBeCloseTo(15.43, 2);
    });
});

describe("AA thresholds", () => {
    it("keeps the WCAG values", () => {
        expect(AA_NORMAL).toBe(4.5);
        expect(AA_LARGE).toBe(3);
    });
});
