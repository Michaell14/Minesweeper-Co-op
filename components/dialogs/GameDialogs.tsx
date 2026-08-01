import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS } from '@/lib/dialogs';
import { Button, Dialog, DialogClose } from '@/components/ds';
import GameSummary from '@/components/game/GameSummary';

/**
 * The app-level dialogs: game over, room errors, and the PVP outcomes.
 *
 * These are opened imperatively by the socket handlers in hooks/useGameEvents.ts
 * via `openDialog(DIALOGS.x)`; this component only renders the markup.
 *
 * <Dialog> owns the shell — positioning, the form, the aria wiring and the
 * action row — so what is left here is only what differs between them.
 */
export interface GameDialogsProps {
    /** Starts a fresh board. Same action as the side panel's Reset. */
    resetGame: () => void;
}

export default function GameDialogs({ resetGame }: GameDialogsProps) {
    const gameOverName = useMinesweeperStore((state) => state.gameOverName);
    const gameWon = useMinesweeperStore((state) => state.gameWon);
    const setPlayerJoined = useMinesweeperStore((state) => state.setPlayerJoined);

    return (
        <>
            {/*
              * End of a co-op run, won or lost.
              *
              * One dialog for both outcomes: a win previously ended with confetti
              * and nothing to read, and a loss with a line of text and no sense of
              * how far the room got. What changes between them is the headline and
              * the tone of the primary button; the numbers are the same numbers.
              */}
            <Dialog
                id={DIALOGS.gameSummary}
                title={gameWon ? 'Board Cleared!' : 'Uh Oh!'}
                alert
                actionsAlign="between"
                actions={
                    <>
                        <DialogClose aria-label="Close summary">Close</DialogClose>
                        {/*
                          * type="submit" so the dialog closes on the same click —
                          * a Button defaults to type="button" and would leave the
                          * summary covering the fresh board.
                          */}
                        <Button
                            type="submit"
                            intent={gameWon ? 'success' : 'primary'}
                            onClick={resetGame}>
                            Play again
                        </Button>
                    </>
                }>
                {!gameWon && (
                    <p><span className="underline decoration-2">{gameOverName}</span> hit a bomb.</p>
                )}
                <GameSummary />
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

            {/*
              * The three PVP dialogs below END the race, so each one carries the
              * summary. `pvpGameOver` deliberately does not: hitting a mine stops
              * YOUR clock but the opponent plays on, and you can reset and rejoin
              * the race — a final scoreline there would be claiming the game is
              * over when it is not.
              */}

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
                <GameSummary />
            </Dialog>

            {/* PVP Opponent Won */}
            <Dialog
                id={DIALOGS.pvpOpponentWon}
                title="Defeat"
                alert
                actions={<DialogClose aria-label="Close dialog">OK</DialogClose>}>
                <p>Your opponent completed their board first.</p>
                <GameSummary />
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
                <GameSummary />
            </Dialog>
        </>
    );
}
