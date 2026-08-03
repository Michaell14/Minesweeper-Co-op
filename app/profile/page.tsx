import type { Metadata } from "next";
import ProfileClient from "./ProfileClient";

/**
 * The private stats dashboard — own account only, nothing public
 * (USER_PROFILES_PRD.md: private stats was the visibility decision).
 * noindex for the same reason as /settings.
 */
export const metadata: Metadata = {
    title: "Profile — Minesweeper Co-op",
    robots: { index: false, follow: false },
};

export default function ProfilePage() {
    return <ProfileClient />;
}
