/**
 * WCAG contrast, measured against what the browser actually painted.
 *
 * Every colour is a custom property a theme can redefine, so the only
 * trustworthy reading resolves the pair in the DOM rather than computing it from
 * the token source: a palette that looks fine as swatches can still put muted
 * text below 4.5:1 on a panel.
 *
 * The maths is separated from the DOM lookup so it can be tested — a transposed
 * coefficient would produce plausible, wrong, unfalsifiable output forever.
 */

export type Rgb = readonly [number, number, number];

/** Relative luminance, per WCAG 2.1. */
export function luminance([r, g, b]: Rgb): number {
    const channel = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, 1:1 to 21:1. Order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
    const [x, y] = [luminance(a), luminance(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** AA: 4.5:1 for body text, 3:1 for large or bold text. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

/** Resolves any CSS colour expression to sRGB by letting the browser do it. */
function resolve(expr: string, probe: HTMLElement): Rgb {
    probe.style.color = "";
    probe.style.color = expr;
    const parts = getComputedStyle(probe).color.match(/[\d.]+/g);
    if (!parts) return [0, 0, 0];
    return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

export interface ContrastPair {
    label: string;
    fg: string;
    bg: string;
    large?: boolean;
}

export interface ContrastResult extends ContrastPair {
    ratio: number;
    passes: boolean;
    threshold: number;
}

export function measure(pairs: ContrastPair[]): ContrastResult[] {
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.appendChild(probe);

    const results = pairs.map((pair) => {
        const ratio = contrastRatio(resolve(pair.fg, probe), resolve(pair.bg, probe));
        const threshold = pair.large ? AA_LARGE : AA_NORMAL;
        return { ...pair, ratio, passes: ratio >= threshold, threshold };
    });

    probe.remove();
    return results;
}

/**
 * Every button intent, derived rather than listed — adding a sixth intent must
 * not be able to escape the audit by someone forgetting to add a row here.
 */
const INTENT_PAIRS: ContrastPair[] = ["primary", "success", "warning", "error"].flatMap(
    (intent) => [
        {
            label: `${intent} button`,
            fg: `var(--ms-intent-${intent}-ink)`,
            bg: `var(--ms-intent-${intent})`,
        },
        {
            // Hover is a state a user reads text in, so it needs auditing too.
            // Leaving it out is what let the default palette ship a hover fill
            // that failed AA while its resting fill passed.
            label: `${intent} button, hover`,
            fg: `var(--ms-intent-${intent}-ink)`,
            bg: `var(--ms-intent-${intent}-hover)`,
        },
    ],
);

/** Likewise the eight cell numbers, all of which sit on the open-cell fill. */
const NUMBER_PAIRS: ContrastPair[] = Array.from({ length: 8 }, (_, i) => ({
    label: `cell number ${i + 1}`,
    fg: `var(--ms-num-${i + 1})`,
    bg: "var(--ms-cell-open)",
}));

export const AUDITED_PAIRS: ContrastPair[] = [
    { label: "body text on page", fg: "var(--ms-ink-strong)", bg: "var(--ms-surface-page)" },
    { label: "body text on panel", fg: "var(--ms-ink-strong)", bg: "var(--ms-surface-panel)" },
    { label: "muted text on panel", fg: "var(--ms-ink-muted)", bg: "var(--ms-surface-panel)" },
    { label: "option label on card", fg: "var(--ms-ink-strong)", bg: "var(--ms-surface-option)" },
    { label: "banner text", fg: "var(--ms-ink-on-banner)", bg: "var(--ms-surface-banner)" },
    ...INTENT_PAIRS,
    ...NUMBER_PAIRS,
];
