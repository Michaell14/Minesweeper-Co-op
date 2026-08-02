'use client'
import React from 'react';
import { Dialog, DialogClose } from '@/components/ds';
import { DIALOGS } from '@/lib/dialogs';
import ThemeCards from '@/components/ThemeCards';

/**
 * Palette chooser dialog. Just a shell now: the cards and their state live in
 * ThemeCards + the settings slice, shared with the /settings page.
 */
export default function ThemePicker() {
    return (
        <Dialog
            id={DIALOGS.theme}
            title="Palette"
            className="max-w-2xl"
            actions={<DialogClose aria-label="Close palette dialog">Done</DialogClose>}
        >
            <ThemeCards name="app-theme-dialog" />
        </Dialog>
    );
}
