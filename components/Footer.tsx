'use client'
import React from 'react';
import Link from 'next/link';
import { DIALOGS, openDialog } from '@/lib/dialogs';
import { CoinIcon, Dialog, DialogClose, GearIcon, GithubIcon, PaletteIcon, UserIcon, pointerClass } from '@/components/ds';
import ThemePicker from '@/components/ThemePicker';
import AccountMenu from '@/components/AccountMenu';

export default function Footer() {

    const openGuideDialog = () => openDialog(DIALOGS.guide);
    const openThemeDialog = () => openDialog(DIALOGS.theme);
    const openAccountDialog = () => openDialog(DIALOGS.account);

    return (
        <>
            <div className="xl:absolute mr-8 mb-6 xl:ml-0 xl:mb-0 float-right right-8 bottom-8 flex items-center gap-3">
                <a
                    href="https://github.com/Michaell14/Minesweeper-Co-op"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View this project on GitHub"
                    className={pointerClass}>
                    <GithubIcon size={48} />
                </a>
                {/*
                  * Was an <i> carrying an onClick: not focusable, not reachable
                  * by keyboard, and announced as nothing. It opens a dialog, so
                  * it is a button.
                  */}
                <button
                    type="button"
                    onClick={openGuideDialog}
                    aria-label="How to play"
                    className={pointerClass}>
                    <CoinIcon size={48} />
                </button>
                <button
                    type="button"
                    onClick={openThemeDialog}
                    aria-label="Choose colour palette"
                    className={pointerClass}>
                    <PaletteIcon size={48} />
                </button>
                <button
                    type="button"
                    onClick={openAccountDialog}
                    aria-label="Account"
                    className={pointerClass}>
                    <UserIcon size={48} />
                </button>
                <Link href="/settings" aria-label="Settings" className={pointerClass}>
                    <GearIcon size={48} />
                </Link>
            </div>

            <Dialog
                id={DIALOGS.guide}
                title="How to Play!"
                className="max-w-2xl"
                actionsAlign="between"
                actions={
                    <>
                        <div>
                            <p className="text-pixel-sm text-ink-muted">Suggestions for new features?</p>
                            <p className="text-pixel-sm text-ink-muted -mt-3">
                                <a
                                    href="https://forms.gle/ALpScH8K7K2QsA8M7"
                                    target="_blank"
                                    rel="noopener noreferrer">
                                    Fill out this form
                                </a>
                            </p>
                        </div>
                        <DialogClose aria-label="Close how to play dialog">Cancel</DialogClose>
                    </>
                }>
                <p>1) Create a room code (Can be anything you want)</p>
                <p>2) Share your room code with friends</p>
                <p>3) Play together!</p>
                <hr />
            </Dialog>

            <ThemePicker />
            <AccountMenu />
        </>
    )
}
