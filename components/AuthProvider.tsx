'use client'
/**
 * next-auth's SessionProvider, isolated in its own client component so
 * app/layout.tsx can stay a server component. Wraps everything: the account
 * menu in the Footer is the main consumer, via useSession().
 */
import { SessionProvider } from "next-auth/react";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
    return <SessionProvider>{children}</SessionProvider>;
}
