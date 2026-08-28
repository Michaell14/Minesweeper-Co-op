"use client"
import React from "react";
import { useMinesweeperStore } from './store';
import Landing from "@/components/Landing";
import Grid from "@/components/Grid";
import GameDialogs from "@/components/dialogs/GameDialogs";
import ConnectionBanner from "@/components/ConnectionBanner";
import { useGameSession } from "@/hooks/useGameSession";

/**
 * Chooses between the Landing page and the game Grid. All socket wiring lives
 * in `useGameSession`, which `/daily` mounts too.
 *
 * The daily challenge used to be a third branch here, gated on `dailyActive`.
 * It is its own route now — it is a distinct thing to arrive at, link to and
 * bookmark, and as a flag on this page it had no URL for any of that.
 */
export default function Home() {
    const { actions } = useGameSession();

    // Subscribed narrowly on purpose: this component re-renders only when the
    // view switches, not on every board or hover update.
    const playerJoined = useMinesweeperStore((state) => state.playerJoined);

    return (
        <>
            <ConnectionBanner />
            {!playerJoined ? (
                <Landing
                    createRoom={actions.createRoom}
                    joinRoom={actions.joinRoom}
                    findMatch={actions.findMatch}
                    cancelMatch={actions.cancelMatch}
                    startPracticeRace={actions.startPracticeRace}
                />
            ) : (
                <Grid
                    leaveRoom={actions.leaveRoom}
                    resetGame={actions.resetGame}
                    toggleFlag={actions.toggleFlag}
                    openCell={actions.openCell}
                    chordCell={actions.chordCell}
                    emitConfetti={actions.emitConfetti}
                    sendEmote={actions.sendEmote}
                    pingCell={actions.pingCell}
                    inviteFriend={actions.inviteFriend}
                    emitCellHover={actions.emitCellHover}
                    handleBoardLeave={actions.handleBoardLeave}
                    startPvpGame={actions.startPvpGame}
                    resetMyBoard={actions.resetMyBoard}
                    pvpRematch={actions.pvpRematch}
                />
            )}

            <GameDialogs
                resetGame={actions.resetGame}
                addRoomFriend={actions.addRoomFriend}
            />
        </>
    );
};
