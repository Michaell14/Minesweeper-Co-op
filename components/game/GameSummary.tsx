import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import ScoreTable from '@/components/game/ScoreTable';
import { useGameStats } from '@/hooks/useGameStats';
import { elapsedSeconds, formatClock } from '@/lib/gameClock';

/** One number and its caption. */
function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="text-center">
            <dt className="text-pixel-xs text-ink-muted">{label}</dt>
            <dd className="text-pixel-lg m-0">{value}</dd>
        </div>
    );
}

/**
 * What the run amounted to: how long, how much of the board, and who did it.
 *
 * Everything here is derived from state the client already holds — the board it
 * is rendering and the numbers already on screen in the side panel. A summary is
 * a different *view* of a finished game, not new information, so it needs no
 * payload of its own.
 *
 * The two modes end differently and so read differently. Co-op is a shared
 * result, so it ends on the scoreboard. PVP is a race, so the only number that
 * settles anything is how far each player got — and the score table is hidden in
 * PVP everywhere else, which is why it is not simply reused here.
 */
export default function GameSummary() {
    const mode = useMinesweeperStore((state) => state.mode);
    const startedAt = useMinesweeperStore((state) => state.startedAt);
    const endedAt = useMinesweeperStore((state) => state.endedAt);
    const playerStatsInRoom = useMinesweeperStore((state) => state.playerStatsInRoom);
    const pvpOpponentName = useMinesweeperStore((state) => state.pvpOpponentName);

    const { ownProgress, safeCells, ownProgressPercent, opponentProgressPercent } = useGameStats();

    const percent = safeCells === 0 ? 0 : Math.round((ownProgress / safeCells) * 100);
    const duration =
        startedAt !== null && endedAt !== null ? formatClock(elapsedSeconds(startedAt, endedAt)) : null;

    const isPvp = mode === 'pvp';

    return (
        <div className="flex flex-col gap-4">
            <dl className="flex justify-center gap-8 m-0">
                {duration && <Stat label="Time" value={duration} />}
                {isPvp ? (
                    <>
                        <Stat label="You" value={`${ownProgressPercent}%`} />
                        <Stat label={pvpOpponentName || 'Opponent'} value={`${opponentProgressPercent}%`} />
                    </>
                ) : (
                    <>
                        <Stat label="Cleared" value={`${percent}%`} />
                        <Stat label="Cells" value={`${ownProgress}/${safeCells}`} />
                    </>
                )}
            </dl>

            {!isPvp && playerStatsInRoom.length > 0 && (
                <div className="overflow-x-auto">
                    <ScoreTable />
                </div>
            )}
        </div>
    );
}
