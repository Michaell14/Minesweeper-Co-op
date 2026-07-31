import type { Metadata } from "next";
import DsCatalogClient from "./DsCatalogClient";

/**
 * Component catalog for the design system.
 *
 * Every primitive is rendered beside the NES.css markup it replaces, so a
 * change to a token or a border can be eyeballed against the original rather
 * than against a memory of it. This is also the fastest way to review the whole
 * system at once — the app itself never shows a warning button or a disabled
 * state on the same screen as everything else.
 *
 * noindex: it is a dev surface on a public domain, not a page for players.
 */
export const metadata: Metadata = {
    title: "Design system — Minesweeper Co-op",
    robots: { index: false, follow: false },
};

export default function DsCatalogPage() {
    return <DsCatalogClient />;
}
