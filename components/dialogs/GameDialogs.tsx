import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS } from '@/lib/dialogs';
import { Dialog, DialogClose } from '@/components/ds';

/**
 * The app-level dialogs: game over, room errors, and the PVP outcomes.
 *
 * These are opened imperatively by the socket handlers in hooks/useGameEvents.ts
 * via `openDialog(DIALOGS.x)`; this component only renders the markup.
 *
 * The nine of them used to be nine hand-written copies of the same shell —
 * positioning classes, <form method="dialog">, aria wiring and an action row,
 * repeated verbatim and free to drift. <Dialog> owns that shell now, so what is
 * left here is only what actually differs between them.
 */
export default function GameDialogs() {
    const gameOverName = useMinesweeperStore((state) => state.gameOverName);
    const setPlayerJoined = useMinesweeperStore((state) => state.setPlayerJoined);

    return (
        <>
            {/* Game Over - someone hit a mine */}
            <Dialog
                id={DIALOGS.gameOver}
                title="Uh Oh!"
                alert
                actions={
                    <DialogClose intent="error" size="sm" aria-label="Close game over dialog">
                        Cancel
                    </DialogClose>
                }>
                <p><span className="underline decoration-2">{gameOverName}</span> hit a bomb.</p>
            </Dialog>

            {/* Create Room Error - room already exists */}
            <Dialog
                id={DIALOGS.createRoomError}
                title="This room already exists."
                alert
                actionsAlign="between"
                actions={<DialogClose aria-label="Close error dialog">Cancel</DialogClose>}
            />

            {/* Join Room Error - room doesn't exist */}
            <Dialog
                id={DIALOGS.joinRoomError}
                title="This room does not exist."
                alert
                actionsAlign="between"
                actions={<DialogClose aria-label="Close error dialog">Cancel</DialogClose>}
            />

            {/* Room Deleted Error - room became invalid during gameplay */}
            <Dialog
                id={DIALOGS.roomDoesNotExist}
                title="There was an error joining the room."
                alert
                actionsAlign="between"
                actions={
                    <DialogClose
                        onClick={() => setPlayerJoined(false)}
                        aria-label="Close error dialog">
                        Cancel
                    </DialogClose>
                }
            />

            {/* PVP Room Full - cannot join */}
            <Dialog
                id={DIALOGS.pvpRoomFull}
                title="Room Full!"
                alert
                actions={<DialogClose aria-label="Close dialog">OK</DialogClose>}>
                <p>This PVP room already has 2 players.</p>
            </Dialog>

            {/* PVP Game Over - this player hit a mine */}
            <Dialog
                id={DIALOGS.pvpGameOver}
                title="Boom!"
                alert
                actions={
                    <DialogClose intent="error" aria-label="Close dialog">OK</DialogClose>
                }>
                <p>You hit a mine. Reset your board to try again!</p>
            </Dialog>

            {/* PVP You Won */}
            <Dialog
                id={DIALOGS.pvpYouWon}
                title="Victory!"
                alert
                actions={
                    <DialogClose intent="success" aria-label="Close dialog">Awesome!</DialogClose>
                }>
                <p>You completed your board first. You win!</p>
            </Dialog>

            {/* PVP Opponent Won */}
            <Dialog
                id={DIALOGS.pvpOpponentWon}
                title="Defeat"
                alert
                actions={<DialogClose aria-label="Close dialog">OK</DialogClose>}>
                <p>Your opponent completed their board first.</p>
            </Dialog>

            {/* PVP Opponent Disconnected */}
            <Dialog
                id={DIALOGS.pvpOpponentDisconnected}
                title="Victory!"
                alert
                actions={
                    <DialogClose intent="success" aria-label="Close dialog">Nice!</DialogClose>
                }>
                <p>Your opponent disconnected. You win by default!</p>
            </Dialog>
        </>
    );
}
