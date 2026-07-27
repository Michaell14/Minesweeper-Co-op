import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS } from '@/lib/dialogs';

/**
 * The app-level dialogs: game over, room errors, and the PVP outcomes.
 *
 * These are opened imperatively by the socket handlers in hooks/useGameEvents.ts
 * via `openDialog(DIALOGS.x)`; this component only renders the markup.
 */
export default function GameDialogs() {
    const gameOverName = useMinesweeperStore((state) => state.gameOverName);
    const setPlayerJoined = useMinesweeperStore((state) => state.setPlayerJoined);

    return (
        <>
            {/* Game Over - someone hit a mine */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.gameOver}
                role="alertdialog"
                aria-labelledby="game-over-title">
                <form method="dialog">
                    <p id="game-over-title" className="title">Uh Oh!</p>
                    <p><span className="underline decoration-2">{gameOverName}</span> hit a bomb.</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-error text-xs" aria-label="Close game over dialog">Cancel</button>
                    </menu>
                </form>
            </dialog>

            {/* Create Room Error - room already exists */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.createRoomError}
                role="alertdialog"
                aria-labelledby="create-room-error-title">
                <form method="dialog">
                    <p id="create-room-error-title">This room already exists.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn" aria-label="Close error dialog">Cancel</button>
                    </div>
                </form>
            </dialog>

            {/* Join Room Error - room doesn't exist */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.joinRoomError}
                role="alertdialog"
                aria-labelledby="join-room-error-title">
                <form method="dialog">
                    <p id="join-room-error-title">This room does not exist.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn" aria-label="Close error dialog">Cancel</button>
                    </div>
                </form>
            </dialog>

            {/* Room Deleted Error - room became invalid during gameplay */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.roomDoesNotExist}
                role="alertdialog"
                aria-labelledby="room-error-title">
                <form method="dialog">
                    <p id="room-error-title">There was an error joining the room.</p>
                    <div className="flex justify-between">
                        <button
                            className="nes-btn"
                            onClick={() => setPlayerJoined(false)}
                            aria-label="Close error dialog">Cancel</button>
                    </div>
                </form>
            </dialog>

            {/* PVP Room Full - cannot join */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.pvpRoomFull}
                role="alertdialog"
                aria-labelledby="pvp-room-full-title">
                <form method="dialog">
                    <p id="pvp-room-full-title" className="title">Room Full!</p>
                    <p>This PVP room already has 2 players.</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn" aria-label="Close dialog">OK</button>
                    </menu>
                </form>
            </dialog>

            {/* PVP Game Over - this player hit a mine */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.pvpGameOver}
                role="alertdialog"
                aria-labelledby="pvp-game-over-title">
                <form method="dialog">
                    <p id="pvp-game-over-title" className="title">Boom!</p>
                    <p>You hit a mine. Reset your board to try again!</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-error" aria-label="Close dialog">OK</button>
                    </menu>
                </form>
            </dialog>

            {/* PVP You Won */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.pvpYouWon}
                role="alertdialog"
                aria-labelledby="pvp-you-won-title">
                <form method="dialog">
                    <p id="pvp-you-won-title" className="title">Victory!</p>
                    <p>You completed your board first. You win!</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-success" aria-label="Close dialog">Awesome!</button>
                    </menu>
                </form>
            </dialog>

            {/* PVP Opponent Won */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.pvpOpponentWon}
                role="alertdialog"
                aria-labelledby="pvp-opponent-won-title">
                <form method="dialog">
                    <p id="pvp-opponent-won-title" className="title">Defeat</p>
                    <p>Your opponent completed their board first.</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn" aria-label="Close dialog">OK</button>
                    </menu>
                </form>
            </dialog>

            {/* PVP Opponent Disconnected */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.pvpOpponentDisconnected}
                role="alertdialog"
                aria-labelledby="pvp-opponent-disconnected-title">
                <form method="dialog">
                    <p id="pvp-opponent-disconnected-title" className="title">Victory!</p>
                    <p>Your opponent disconnected. You win by default!</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-success" aria-label="Close dialog">Nice!</button>
                    </menu>
                </form>
            </dialog>
        </>
    );
}
