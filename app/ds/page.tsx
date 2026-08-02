import type { Metadata } from "next";
import DsCatalogClient from "./DsCatalogClient";

/**
 * Component catalog for the design system — every primitive, every intent and
 * every palette on one screen, which the app itself never shows.
 *
 * noindex: a dev surface on a public domain, not a page for players.
 */
export const metadata: Metadata = {
    title: "Design system — Minesweeper Co-op",
    robots: { index: false, follow: false },
};

export default function DsCatalogPage() {
    return <DsCatalogClient />;
}
