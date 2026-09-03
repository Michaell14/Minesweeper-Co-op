"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Panel } from '@/components/ds';
import Board from '@/components/game/Board';
import FlagCounter from '@/components/game/FlagCounter';
import Timer from '@/components/game/Timer';
import { useGameStats } from '@/hooks/useGameStats';
import { useChording } from '@/hooks/useChording';
import { useKeyboardControls } from '@/hooks/useKeyboardControls';
import { DIALOGS, openDialog } from '@/lib/dialogs';

interface DailyChallengeParams {
    leaveDaily: () => void;
    dailyOpenCell: (row: number, col: number) => void;
    dailyChordCell: (row: number, col: number) => void;
    dailyToggleFlag: (row: number, col: number) => void;
    getDailyLeaderboard: () => void;
}

/** Board's hover callbacks are for co-op cursor presence; the daily is solo. */
const noop = () => {};

/**
 * Sibling to Grid.tsx, not a variant: none of Grid's room/PVP layout applies
 * to a solo game. Reuses gameSlice's board fields and the Board/Cell/FlagCounter
 * components unchanged; app/page.tsx renders exactly one of daily and room.
 */
export default function DailyChallenge({ leaveDaily, dailyOpenCell, dailyChordCell, dailyToggleFlag, getDailyLeaderboard }: DailyChallengeParams) {
    const board = useMinesweeperStore((state) => state.board);
    const dailyStatus = useMinesweeperStore((state) => state.dailyStatus);
    const dailyRank = useMinesweeperStore((state) => state.dailyRank);
    const { remainingFlags } = useGameStats();

    /*
     * Cell records the button state whatever the mode. Mounted by Grid alone,
     * chording did nothing on the daily and left the button state set, so the
     * first chord in a later room fired on the wrong cell.
     */
    useChording(dailyChordCell);

    // Keyboard play, with the daily's own callbacks; hover stays a noop (solo).
    useKeyboardControls({
        openCell: dailyOpenCell,
        toggleFlag: dailyToggleFlag,
        chordCell: dailyChordCell,
        emitCellHover: noop,
    });

    // <Timer> reads gameSlice's run clock, which the daily handlers set directly;
    // deriving it here would render one frame of the previous value first.

    const boardProps = {
        toggleFlag: dailyToggleFlag,
        openCell: dailyOpenCell,
        chordCell: dailyChordCell,
        emitCellHover: noop,
        handleBoardLeave: noop,
    };

    // A resumed terminal attempt carries its FINAL board for a view-only replay;
    // an empty board means "none available", not "none opened yet".
    const hasBoard = board.length > 0;
    const isTerminal =
        dailyStatus === 'failed' || dailyStatus === 'won_pending_submit' || dailyStatus === 'completed';

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
                <>
                    <div className="flex justify-center overflow-auto xl:overflow-visible max-w-full">
                        <Board {...boardProps} />
                    </div>
                    {/* Once settled the board is a view-only replay (moves are refused in
                        emitDailyCellAction); this strip says so and keeps the actions reachable. */}
                    {isTerminal && (
                        <div className="flex justify-center mt-6">
                            <Panel centered className="max-w-md" role="status">
                                {dailyStatus === 'failed' && (
                                    <p className="text-pixel-sm">You hit a mine — this board is view-only. Come back tomorrow!</p>
                                )}
                                {dailyStatus === 'won_pending_submit' && (
                                    <p className="text-pixel-sm">Solved! Add your time to today&apos;s leaderboard.</p>
                                )}
                                {dailyStatus === 'completed' && (
                                    <p className="text-pixel-sm">
                                        Completed{dailyRank ? <> — rank <strong>#{dailyRank}</strong></> : ''}. This board is view-only.
                                    </p>
                                )}
                                {dailyStatus === 'won_pending_submit' ? (
                                    <Button
                                        size="sm"
                                        className="mt-4"
                                        onClick={() => openDialog(DIALOGS.dailySubmit)}
                                        aria-label="Submit your time to the leaderboard">
                                        Submit score
                                    </Button>
                                ) : (
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
                                )}
                            </Panel>
                        </div>
                    )}
                </>
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
