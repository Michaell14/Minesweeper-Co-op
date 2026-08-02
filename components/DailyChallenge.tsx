"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Panel } from '@/components/ds';
import Board from '@/components/game/Board';
import FlagCounter from '@/components/game/FlagCounter';
import Timer from '@/components/game/Timer';
import { useGameStats } from '@/hooks/useGameStats';
import { DIALOGS, openDialog } from '@/lib/dialogs';

interface DailyChallengeParams {
    leaveDaily: () => void;
    dailyOpenCell: (row: number, col: number) => void;
    dailyChordCell: (row: number, col: number) => void;
    dailyToggleFlag: (row: number, col: number) => void;
    getDailyLeaderboard: () => void;
}

/** Board takes hover callbacks for co-op cursor presence, which the daily
 * challenge (solo, no room) has no use for -- extra args are ignored. */
const noop = () => {};

/**
 * Sibling to Grid.tsx, not a variant of it: none of Grid's room/PVP-progress
 * layout applies to a solo, room-free game. Reuses gameSlice's board/gameOver/
 * gameWon and the existing Board/Cell/FlagCounter components unchanged --
 * daily and room views are mutually exclusive (app/page.tsx renders exactly
 * one), so sharing those fields costs nothing and keeps the "board mounts
 * exactly once" invariant automatically.
 */
export default function DailyChallenge({ leaveDaily, dailyOpenCell, dailyChordCell, dailyToggleFlag, getDailyLeaderboard }: DailyChallengeParams) {
    const board = useMinesweeperStore((state) => state.board);
    const dailyStatus = useMinesweeperStore((state) => state.dailyStatus);
    const dailyRank = useMinesweeperStore((state) => state.dailyRank);
    const { remainingFlags } = useGameStats();

    // <Timer> (below) reads gameSlice's shared run clock, the same one
    // Grid.tsx feeds for co-op/PVP. The daily socket handlers in
    // hooks/useGameEvents.ts set it directly as each event arrives, rather
    // than this component deriving it reactively -- this component can mount
    // with a board already present (a resume arrives with both in one event),
    // and a useEffect-based sync here would render one frame of gameSlice's
    // PREVIOUS clock value before catching up.

    const boardProps = {
        toggleFlag: dailyToggleFlag,
        openCell: dailyOpenCell,
        chordCell: dailyChordCell,
        emitCellHover: noop,
        handleBoardLeave: noop,
    };

    /**
     * A resumed terminal attempt (dailyAlreadyAttempted) never carries a board
     * -- the server explicitly withholds one there -- so board.length === 0
     * distinguishes "no board available" from a board mid-play.
     */
    const hasBoard = board.length > 0;

    return (
        <div className="w-full max-w-[1350px] mx-auto px-4 min-h-[94vh] pt-10 pb-6 xl:pt-20 xl:pb-16 [container-type:inline-size]">
            <h1 className="text-center font-bold text-pixel-2xl md:text-pixel-4xl">Daily Challenge</h1>

            <div aria-live="assertive" aria-atomic="true" className="sr-only">
                {dailyStatus === "won_pending_submit" && "You solved today's puzzle!"}
                {dailyStatus === "failed" && "You hit a mine."}
            </div>

            <div className="flex justify-center items-center gap-6 mt-6 mb-6">
                <Button
                    intent="warning"
                    size="sm"
                    onClick={leaveDaily}
                    aria-label="Leave daily challenge and return to home page">
                    Return to Home
                </Button>
                {hasBoard && (
                    <>
                        <Timer variant="hud" />
                        <FlagCounter remainingFlags={remainingFlags} variant="hud" />
                    </>
                )}
            </div>

            {hasBoard ? (
                <div className="flex justify-center overflow-auto xl:overflow-visible max-w-full">
                    <Board {...boardProps} />
                </div>
            ) : (
                <div className="flex justify-center mt-10">
                    <Panel centered className="max-w-md" role="status">
                        {dailyStatus === "failed" && <p className="text-pixel-sm">You already attempted today&apos;s puzzle and hit a mine. Come back tomorrow!</p>}
                        {dailyStatus === "won_pending_submit" && <p className="text-pixel-sm">You solved today&apos;s puzzle! Enter your name to add it to the leaderboard.</p>}
                        {dailyStatus === "completed" && (
                            <p className="text-pixel-sm">You&apos;ve already completed today&apos;s puzzle{dailyRank ? ` — rank #${dailyRank}` : ""}.</p>
                        )}
                        <Button
                            size="sm"
                            className="mt-4"
                            onClick={() => {
                                getDailyLeaderboard();
                                openDialog(DIALOGS.dailyLeaderboard);
                            }}
                            aria-label="View today's leaderboard">
                            View Leaderboard
                        </Button>
                    </Panel>
                </div>
            )}
        </div>
    );
}
