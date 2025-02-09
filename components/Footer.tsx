'use client'
import React from 'react';

export default function Footer() {

    const openGuideDialog = () => {
        (document.getElementById('dialog-guide') as HTMLDialogElement)?.showModal();
    }

    return (
        <>
            <div className="xl:absolute mr-8 mb-6 xl:ml-0 xl:mb-0 float-right right-8 bottom-8">
                <a href="https://github.com/Michaell14/Minesweeper-Co-op" target="_blank"><i className="nes-icon github is-medium nes-pointer"></i></a>
                <i onClick={openGuideDialog} className="nes-icon coin is-medium nes-pointer ml-3"></i>
            </div>
            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2 max-w-2xl" id="dialog-guide">
                <form method="dialog">
                    <p className="title">How to Play!</p>
                    <p>1) Create a room code (Can be anything you want)</p>
                    <p>2) Share your room code with friends</p>
                    <p>3) Play together!</p>
                    <hr />

                    <menu className="dialog-menu justify-between flex mt-3">
                        <div>
                            <p className="text-xs text-gray-600">Suggestions for new features?</p>
                            <p className="text-xs text-gray-600 -mt-3"><a href="https://forms.gle/ALpScH8K7K2QsA8M7" target="_blank">Fill out this form</a></p>
                        </div>
                        <button className="nes-btn">Cancel</button>
                    </menu>
                </form>
            </dialog>
        </>
    )
}
