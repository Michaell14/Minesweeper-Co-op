import type { Config } from "tailwindcss";

/**
 * Tailwind reads the design tokens rather than defining a parallel palette.
 *
 * Every entry below points at a custom property in app/tokens.css, so
 * `bg-surface-panel` and a component that writes
 * `background: var(--ms-surface-panel)` resolve to the same value, and an
 * alternate palette overriding the token moves both. Adding a raw hex here
 * would reintroduce exactly the split this is meant to remove.
 *
 * Tailwind's own default palette is still available — this extends rather than
 * replaces it — but new UI should reach for the semantic names.
 */
const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        // The app's one font is applied globally in app/globals.css via the
        // next/font CSS variable, not through a Tailwind `font-*` utility.
        extend: {
            colors: {
                surface: {
                    page: "var(--ms-surface-page)",
                    panel: "var(--ms-surface-panel)",
                    dialog: "var(--ms-surface-dialog)",
                    banner: "var(--ms-surface-banner)",
                    disabled: "var(--ms-surface-disabled)",
                    track: "var(--ms-surface-track)",
                },
                ink: {
                    DEFAULT: "var(--ms-ink-strong)",
                    muted: "var(--ms-ink-muted)",
                    "muted-hover": "var(--ms-ink-muted-hover)",
                    inverse: "var(--ms-ink-inverse)",
                    banner: "var(--ms-ink-on-banner)",
                },
                edge: {
                    DEFAULT: "var(--ms-border-color)",
                    muted: "var(--ms-border-color-muted)",
                },
                primary: {
                    DEFAULT: "var(--ms-intent-primary)",
                    hover: "var(--ms-intent-primary-hover)",
                    ink: "var(--ms-intent-primary-ink)",
                },
                success: {
                    DEFAULT: "var(--ms-intent-success)",
                    hover: "var(--ms-intent-success-hover)",
                    ink: "var(--ms-intent-success-ink)",
                },
                warning: {
                    DEFAULT: "var(--ms-intent-warning)",
                    hover: "var(--ms-intent-warning-hover)",
                    ink: "var(--ms-intent-warning-ink)",
                },
                error: {
                    DEFAULT: "var(--ms-intent-error)",
                    hover: "var(--ms-intent-error-hover)",
                    ink: "var(--ms-intent-error-ink)",
                },
                board: {
                    closed: "var(--ms-cell-closed)",
                    open: "var(--ms-cell-open)",
                    mine: "var(--ms-cell-mine)",
                    gutter: "var(--ms-board-gutter)",
                },
                progress: {
                    own: "var(--ms-progress-own)",
                    opponent: "var(--ms-progress-opponent)",
                    won: "var(--ms-progress-won)",
                    failed: "var(--ms-progress-failed)",
                },
                status: {
                    won: "var(--ms-status-won)",
                    failed: "var(--ms-status-failed)",
                    playing: "var(--ms-status-playing)",
                    idle: "var(--ms-status-idle)",
                },
            },
            fontSize: {
                // Named off the token scale rather than Tailwind's rem sizes:
                // Press Start 2P is a pixel face, so these must stay integer px.
                // Each pairs a size with its leading, exactly as Tailwind's own
                // sizes do — a bare font-size here drops the line-height at
                // every site that used to be a `text-*` class.
                "pixel-2xs": ["var(--ms-text-2xs)", { lineHeight: "var(--ms-leading-2xs)" }],
                "pixel-xs": ["var(--ms-text-xs)", { lineHeight: "var(--ms-leading-xs)" }],
                "pixel-sm": ["var(--ms-text-sm)", { lineHeight: "var(--ms-leading-sm)" }],
                "pixel-md": ["var(--ms-text-md)", { lineHeight: "var(--ms-leading-md)" }],
                "pixel-lg": ["var(--ms-text-lg)", { lineHeight: "var(--ms-leading-lg)" }],
                "pixel-xl": ["var(--ms-text-xl)", { lineHeight: "var(--ms-leading-xl)" }],
                "pixel-2xl": ["var(--ms-text-2xl)", { lineHeight: "var(--ms-leading-2xl)" }],
                "pixel-4xl": ["var(--ms-text-4xl)", { lineHeight: "var(--ms-leading-4xl)" }],
            },
            borderWidth: {
                pixel: "var(--ms-border-width)",
            },
        },
    },
    plugins: [],
};
export default config;
