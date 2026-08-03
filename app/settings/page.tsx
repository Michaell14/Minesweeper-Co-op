import type { Metadata } from "next";
import SettingsClient from "./SettingsClient";

/**
 * The settings page — the app's third route, after / and /ds. Sections grow
 * with the PRD's phases: Appearance now; gameplay, sound and HUD later.
 *
 * noindex: per-player configuration, useless in search results.
 */
export const metadata: Metadata = {
    title: "Settings — Minesweeper Co-op",
    robots: { index: false, follow: false },
};

export default function SettingsPage() {
    return <SettingsClient />;
}
