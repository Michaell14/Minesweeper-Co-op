import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import ScoreTable from '@/components/game/ScoreTable';
import { elapsedSeconds, formatClock } from '@/lib/gameClock';

/**
 * What the run amounted to: how long, how much of the board, and who did it.
 *
 * Everything here is derived from state the client already holds — the board it
 * is rendering and the scores it already shows in the side panel. A summary is a
 * different *view* of the finished game, not new information, so it needs no
 * payload of its own.
 */
export default function GameSummary() {
    const board = useMinesweeperStore((state) => state.board);
    const numMines = useMinesweeperStore((state) => state.numMines);
    const startedAt = useMinesweeperStore((state) => state.startedAt);
    const endedAt = useMinesweeperStore((state) => state.endedAt);
    const playerStatsInRoom = useMinesweeperStore((state) => state.playerStatsInRoom);

    const cellCount = board.reduce((sum, row) => sum + row.length, 0);
    const safeCells = Math.max(0, cellCount - numMines);
    /*
     * Counted rather than read off a score total: a win auto-flags the remaining
     * mines, and scores are per-player and would double-count nothing but also
     * miss any cell opened before a player joined.
     */
    const cleared = board.reduce(
        (sum, row) => sum + row.filter((cell) => cell.isOpen && !cell.isMine).length,
        0
    );
    const percent = safeCells === 0 ? 0 : Math.round((cleared / safeCells) * 100);

    const duration =
        startedAt !== null && endedAt !== null ? formatClock(elapsedSeconds(startedAt, endedAt)) : null;

    return (
        <div className="flex flex-col gap-4">
            <dl className="flex justify-center gap-8 m-0">
                {duration && (
                    <div className="text-center">
                        <dt className="text-pixel-xs text-ink-muted">Time</dt>
                        <dd className="text-pixel-lg m-0">{duration}</dd>
                    </div>
                )}
                <div className="text-center">
                    <dt className="text-pixel-xs text-ink-muted">Cleared</dt>
                    <dd className="text-pixel-lg m-0">{percent}%</dd>
                </div>
                <div className="text-center">
                    <dt className="text-pixel-xs text-ink-muted">Cells</dt>
                    <dd className="text-pixel-lg m-0">{cleared}/{safeCells}</dd>
                </div>
            </dl>

            {playerStatsInRoom.length > 0 && (
                <div className="overflow-x-auto">
                    <ScoreTable />
                </div>
            )}
        </div>
    );
}
