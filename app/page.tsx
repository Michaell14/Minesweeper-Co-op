"use client"
import React from "react";
import { useMinesweeperStore } from './store';
import Landing from "@/components/Landing";
import Grid from "@/components/Grid";
import { useSocket } from "@/hooks/useSocket";
import { useSocketEvents } from "@/hooks/useSocketEvents";
import { useGameActions } from "@/hooks/useGameActions";
import { useGameEvents } from "@/hooks/useGameEvents";

/**
 * Home Component
 * Chooses between the Landing page and the game Grid, and owns the top-level
 * dialogs. All socket wiring lives in hooks/:
 *   useSocket       - connection lifecycle
 *   useGameActions  - client -> server emits
 *   useGameEvents   - server -> client handler table
 *   useSocketEvents - registers that table and derives its own cleanup
 */
export default function Home() {
    const socket = useSocket();
    const actions = useGameActions(socket);
    useSocketEvents(socket, useGameEvents(socket, actions.leaveRoom));

    // Subscribed narrowly on purpose: this component re-renders only when the
    // view switches or the game-over name changes, not on every board or hover
    // update.
    const playerJoined = useMinesweeperStore((state) => state.playerJoined);
    const gameOverName = useMinesweeperStore((state) => state.gameOverName);

    return (
        <>
            {/* Conditional rendering: show Landing page or Game Grid */}
            {!playerJoined ? (
                <Landing createRoom={actions.createRoom} joinRoom={actions.joinRoom} />
            ) : (
                <Grid
                    leaveRoom={actions.leaveRoom}
                    resetGame={actions.resetGame}
                    toggleFlag={actions.toggleFlag}
                    openCell={actions.openCell}
                    chordCell={actions.chordCell}
                    emitConfetti={actions.emitConfetti}
                    emitCellHover={actions.emitCellHover}
                    handleBoardLeave={actions.handleBoardLeave}
                    startPvpGame={actions.startPvpGame}
                    resetMyBoard={actions.resetMyBoard}
                    pvpRematch={actions.pvpRematch}
                />
            )}

            {/* ============================================================================ */}
            {/* ERROR & NOTIFICATION DIALOGS */}
            {/* ============================================================================ */}

            {/* Game Over Dialog - Shows when someone hits a mine */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-game-over"
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

            {/* Create Room Error - Room already exists */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-create-room-error"
                role="alertdialog"
                aria-labelledby="create-room-error-title">
                <form method="dialog">
                    <p id="create-room-error-title">This room already exists.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn" aria-label="Close error dialog">Cancel</button>
                    </div>
                </form>
            </dialog>

            {/* Join Room Error - Room doesn't exist */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-join-room-error"
                role="alertdialog"
                aria-labelledby="join-room-error-title">
                <form method="dialog">
                    <p id="join-room-error-title">This room does not exist.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn" aria-label="Close error dialog">Cancel</button>
                    </div>
                </form>
            </dialog>

            {/* Room Deleted Error - Room became invalid during gameplay */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-room-does-not-exist-error"
                role="alertdialog"
                aria-labelledby="room-error-title">
                <form method="dialog">
                    <p id="room-error-title">There was an error joining the room.</p>
                    <div className="flex justify-between">
                        <button
                            className="nes-btn"
                            onClick={() => useMinesweeperStore.getState().setPlayerJoined(false)}
                            aria-label="Close error dialog">Cancel</button>
                    </div>
                </form>
            </dialog>

            {/* ============================================================================ */}
            {/* PVP-SPECIFIC DIALOGS */}
            {/* ============================================================================ */}

            {/* PVP Room Full - Cannot join */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-pvp-room-full"
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

            {/* PVP Game Over - This player hit a mine */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-pvp-game-over"
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
                id="dialog-pvp-you-won"
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
                id="dialog-pvp-opponent-won"
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
                id="dialog-pvp-opponent-disconnected"
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
};
