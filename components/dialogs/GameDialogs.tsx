import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS } from '@/lib/dialogs';
import { Button, Dialog, DialogClose } from '@/components/ds';
import GameSummary from '@/components/game/GameSummary';

/**
 * The app-level dialogs: game over, room errors, and the PVP outcomes. Opened
 * imperatively by hooks/useGameEvents.ts via `openDialog(DIALOGS.x)`; <Dialog>
 * owns the shell, so only what differs between them lives here.
 */
export interface GameDialogsProps {
    /** Threaded to every summary: the add-friend offer lives in it. */
    addRoomFriend: (playerId: string) => void;
    /** Starts a fresh board. Same action as the side panel's Reset. */
    resetGame: () => void;
}

export default function GameDialogs({ resetGame, addRoomFriend }: GameDialogsProps) {
    const summaryProps = { addRoomFriend };
    const gameOverName = useMinesweeperStore((state) => state.gameOverName);
    const gameWon = useMinesweeperStore((state) => state.gameWon);
    const setPlayerJoined = useMinesweeperStore((state) => state.setPlayerJoined);
    const requestNewRoomCode = useMinesweeperStore((state) => state.requestNewRoomCode);

    return (
        <>
            {/* End of a co-op run, won or lost. One dialog for both: only the
                headline and the button's tone differ. */}
            <Dialog
                id={DIALOGS.gameSummary}
                title={gameWon ? 'Board Cleared!' : 'Uh Oh!'}
                alert
                actionsAlign="between"
                actions={
                    <>
                        <DialogClose aria-label="Close summary">Close</DialogClose>
                        {/* type="submit" so the dialog closes on the same click;
                            Button defaults to type="button". */}
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
                <GameSummary {...summaryProps} />
            </Dialog>

            {/* Both room errors carry a way out; a bare title over "Cancel" was
                a dead end on the one screen where the player needs direction. */}
            <Dialog
                id={DIALOGS.createRoomError}
                title="That room code is taken."
                alert
                actionsAlign="between"
                actions={
                    <>
                        <DialogClose aria-label="Close error dialog">Close</DialogClose>
                        {/* type="submit" so the dialog closes on the same click.
                            No "join it instead": that room is usually a stranger's. */}
                        <Button
                            type="submit"
                            intent="primary"
                            onClick={requestNewRoomCode}>
                            Try a different code
                        </Button>
                    </>
                }>
                <p className="text-pixel-xs text-ink-muted">
                    Someone is already using it. Pick another and create the room again.
                </p>
            </Dialog>

            <Dialog
                id={DIALOGS.joinRoomError}
                title="This room does not exist."
                alert
                actionsAlign="between"
                actions={<DialogClose aria-label="Close error dialog">Close</DialogClose>}>
                <p className="text-pixel-xs text-ink-muted">
                    Check the code with whoever shared it, or create a room and invite them instead.
                </p>
            </Dialog>

            <Dialog
                id={DIALOGS.roomDoesNotExist}
                title="There was an error joining the room."
                alert
                actionsAlign="between"
                actions={
                    <DialogClose
                        onClick={() => setPlayerJoined(false)}
                        aria-label="Close error dialog">
                        Close
                    </DialogClose>
                }
            />

            <Dialog
                id={DIALOGS.pvpRoomFull}
                title="Room Full!"
                alert
                actions={<DialogClose aria-label="Close dialog">OK</DialogClose>}>
                <p>This PVP room already has 2 players.</p>
            </Dialog>

            {/* Every PVP dialog that ENDS the race carries the summary.
                `pvpGameOver` does not: the opponent plays on and you can reset
                back into the race, so a final scoreline would be a lie. */}
            <Dialog
                id={DIALOGS.pvpGameOver}
                title="Boom!"
                alert
                actions={
                    <DialogClose intent="error" aria-label="Close dialog">OK</DialogClose>
                }>
                <p>You hit a mine. Reset your board to try again!</p>
            </Dialog>

            <Dialog
                id={DIALOGS.pvpYouWon}
                title="Victory!"
                alert
                actions={
                    <DialogClose intent="success" aria-label="Close dialog">Awesome!</DialogClose>
                }>
                <p>You completed your board first. You win!</p>
                <GameSummary {...summaryProps} />
            </Dialog>

            <Dialog
                id={DIALOGS.pvpOpponentWon}
                title="Defeat"
                alert
                actions={<DialogClose aria-label="Close dialog">OK</DialogClose>}>
                <p>Your opponent completed their board first.</p>
                <GameSummary {...summaryProps} />
            </Dialog>

            <Dialog
                id={DIALOGS.pvpOpponentDisconnected}
                title="Victory!"
                alert
                actions={
                    <DialogClose intent="success" aria-label="Close dialog">Nice!</DialogClose>
                }>
                <p>Your opponent disconnected. You win by default!</p>
                <GameSummary {...summaryProps} />
            </Dialog>
        </>
    );
}
