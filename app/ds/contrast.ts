/**
 * WCAG contrast, measured against what the browser actually painted.
 *
 * Every colour in the app is a custom property that a theme can redefine, so
 * the only trustworthy way to know a pair's contrast is to resolve it in the
 * DOM rather than compute it from the token source. A palette that reads well
 * as swatches can still put muted text below 4.5:1 on a panel, and that is
 * exactly the failure a retro palette makes easy.
 */

/** Resolves a CSS colour expression to sRGB by letting the browser do it. */
function resolve(expr: string, probe: HTMLElement): [number, number, number] {
    probe.style.color = "";
    probe.style.color = expr;
    const m = getComputedStyle(probe).color.match(/[\d.]+/g);
    if (!m) return [0, 0, 0];
    return [Number(m[0]), Number(m[1]), Number(m[2])];
}

/** Relative luminance, per WCAG 2.1. */
function luminance([r, g, b]: [number, number, number]): number {
    const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export interface ContrastResult {
    label: string;
    ratio: number;
    /** AA for body text is 4.5:1; large/bold text is 3:1. */
    passes: boolean;
    threshold: number;
}

export interface ContrastPair {
    label: string;
    fg: string;
    bg: string;
    /** Large or bold text only needs 3:1. */
    large?: boolean;
}

export function measure(pairs: ContrastPair[]): ContrastResult[] {
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.appendChild(probe);

    const out = pairs.map(({ label, fg, bg, large }) => {
        const a = luminance(resolve(fg, probe));
        const b = luminance(resolve(bg, probe));
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const threshold = large ? 3 : 4.5;
        return { label, ratio, passes: ratio >= threshold, threshold };
    });

    probe.remove();
    return out;
}

/**
 * The pairs worth checking: text on the surfaces it actually sits on, and each
 * button intent's own ink on its own fill.
 */
export const AUDITED_PAIRS: ContrastPair[] = [
    { label: "body text on page", fg: "var(--ms-ink-strong)", bg: "var(--ms-surface-page)" },
    { label: "body text on panel", fg: "var(--ms-ink-strong)", bg: "var(--ms-surface-panel)" },
    { label: "muted text on panel", fg: "var(--ms-ink-muted)", bg: "var(--ms-surface-panel)" },
    { label: "option label on card", fg: "var(--ms-ink-strong)", bg: "var(--ms-surface-option)" },
    { label: "primary button", fg: "var(--ms-intent-primary-ink)", bg: "var(--ms-intent-primary)" },
    { label: "success button", fg: "var(--ms-intent-success-ink)", bg: "var(--ms-intent-success)" },
    { label: "warning button", fg: "var(--ms-intent-warning-ink)", bg: "var(--ms-intent-warning)" },
    { label: "error button", fg: "var(--ms-intent-error-ink)", bg: "var(--ms-intent-error)" },
    { label: "cell number 1", fg: "var(--ms-num-1)", bg: "var(--ms-cell-open)" },
    { label: "cell number 8", fg: "var(--ms-num-8)", bg: "var(--ms-cell-open)" },
];
