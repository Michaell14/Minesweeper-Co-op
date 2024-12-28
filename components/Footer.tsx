'use client'
import React from 'react';

export default function Footer() {

    const openGuideDialog = () => {
        (document.getElementById('dialog-guide') as HTMLDialogElement)?.showModal();
    }

    return (
        <>
            <div className="absolute right-8 bottom-8">
                <a href="https://github.com/Michaell14/Minesweeper-Co-op" target="_blank"><i className="nes-icon github is-medium nes-pointer"></i></a>
                <i onClick={openGuideDialog} className="nes-icon coin is-medium nes-pointer ml-3"></i>
            </div>
            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2 max-w-2xl" id="dialog-guide">
                <form method="dialog">
                    <p className="title">How to Play!</p>
                    <p>1) Create a room code (Can be anything you want)</p>
                    <p>2) Share your room code with friends</p>
                    <p>3) Play together!</p>
                    <menu className="dialog-menu justify-end flex">
                        <button className="nes-btn">Cancel</button>
                    </menu>
                </form>
            </dialog>
        </>
    )
}
