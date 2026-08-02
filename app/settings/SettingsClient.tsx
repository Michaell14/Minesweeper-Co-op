'use client'
import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button, Panel } from '@/components/ds';
import { DIALOGS, openDialog } from '@/lib/dialogs';
import ThemeCards from '@/components/ThemeCards';

/**
 * The settings page body. Each section is a titled Panel with a real heading,
 * so the page reads as a document and each area has an accessible landmark.
 * The account dialogs themselves are mounted by the Footer (in the layout,
 * so present here too) — the button just opens them.
 */
export default function SettingsClient() {
    const { status } = useSession();

    return (
        <main className="max-w-3xl mx-auto px-6 pt-10 pb-24">
            <div className="flex items-baseline justify-between flex-wrap gap-4 mb-8">
                <h1 className="text-pixel-2xl">Settings</h1>
                <Link href="/" className="text-pixel-sm underline">
                    Back to the game
                </Link>
            </div>

            <section aria-labelledby="settings-appearance" className="mb-8">
                <Panel title={<span id="settings-appearance">Appearance</span>}>
                    <ThemeCards name="app-theme-settings" />
                </Panel>
            </section>

            <section aria-labelledby="settings-account">
                <Panel title={<span id="settings-account">Account</span>}>
                    {status === 'authenticated' ? (
                        <p className="text-pixel-sm">
                            Signed in — your settings sync to your account and follow you
                            to any browser you sign in on.
                        </p>
                    ) : (
                        <p className="text-pixel-sm">
                            Your settings are stored in this browser only. Sign in to
                            keep them on every device.
                        </p>
                    )}
                    <Button
                        size="sm"
                        className="mt-4"
                        onClick={() => openDialog(DIALOGS.account)}>
                        {status === 'authenticated' ? 'Manage account' : 'Sign in'}
                    </Button>
                </Panel>
            </section>
        </main>
    );
}
