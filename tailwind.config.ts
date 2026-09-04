import type { Config } from "tailwindcss";

/**
 * Tailwind reads the design tokens rather than defining a parallel palette:
 * every entry points at a custom property in app/tokens.css, so a utility
 * class and a `var()` resolve to the same value and a theme moves both. A raw
 * hex here would reintroduce the split. Extends Tailwind's defaults; new UI
 * should reach for the semantic names.
 */
const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        // The one font is applied globally in app/globals.css via the next/font variable.
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
                // Named off the token scale: Press Start 2P is a pixel face, so
                // sizes stay integer px. Each pairs size with leading, as
                // Tailwind's own do, or `text-*` sites lose their line-height.
                "pixel-2xs": ["var(--ms-text-2xs)", { lineHeight: "var(--ms-leading-2xs)" }],
                "pixel-xs": ["var(--ms-text-xs)", { lineHeight: "var(--ms-leading-xs)" }],
                "pixel-sm": ["var(--ms-text-sm)", { lineHeight: "var(--ms-leading-sm)" }],
                "pixel-md": ["var(--ms-text-md)", { lineHeight: "var(--ms-leading-md)" }],
                "pixel-lg": ["var(--ms-text-lg)", { lineHeight: "var(--ms-leading-lg)" }],
                "pixel-xl": ["var(--ms-text-xl)", { lineHeight: "var(--ms-leading-xl)" }],
                "pixel-2xl": ["var(--ms-text-2xl)", { lineHeight: "var(--ms-leading-2xl)" }],
                "pixel-4xl": ["var(--ms-text-4xl)", { lineHeight: "var(--ms-leading-4xl)" }],
                // Prose, set in Inter, content pages only. See app/tokens.css.
                "body": ["var(--ms-text-body)", { lineHeight: "var(--ms-leading-body)" }],
                "body-sm": ["var(--ms-text-body-sm)", { lineHeight: "var(--ms-leading-body-sm)" }],
            },
            borderWidth: {
                pixel: "var(--ms-border-width)",
            },
            transitionDuration: {
                instant: "var(--ms-duration-instant)",
                quick: "var(--ms-duration-quick)",
                slow: "var(--ms-duration-slow)",
            },
        },
    },
    plugins: [],
};
export default config;
