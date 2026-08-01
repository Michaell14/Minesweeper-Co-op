"use client"
import React from "react";
import { useMinesweeperStore } from './store';
import Landing from "@/components/Landing";
import Grid from "@/components/Grid";
import GameDialogs from "@/components/dialogs/GameDialogs";
import { useSocket } from "@/hooks/useSocket";
import { useSocketEvents } from "@/hooks/useSocketEvents";
import { useGameActions } from "@/hooks/useGameActions";
import { useGameEvents } from "@/hooks/useGameEvents";

/**
 * Home Component
 * Chooses between the Landing page and the game Grid. All socket wiring lives in
 * hooks/:
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
    // view switches, not on every board or hover update.
    const playerJoined = useMinesweeperStore((state) => state.playerJoined);

    return (
        <>
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

            <GameDialogs resetGame={actions.resetGame} />
        </>
    );
};
