import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import ScoreTable from '@/components/game/ScoreTable';
import { useGameStats } from '@/hooks/useGameStats';
import { elapsedSeconds, formatClock } from '@/lib/gameClock';
import BestTimeNote from '@/components/game/BestTimeNote';
import AddFriendsFromGame from '@/components/game/AddFriendsFromGame';
import SupportLink from '@/components/SupportLink';

/** One number and its caption. */
function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="text-center">
            <dt className="text-pixel-xs text-ink-muted">{label}</dt>
            <dd className="text-pixel-lg m-0">{value}</dd>
        </div>
    );
}

export interface GameSummaryProps {
    addRoomFriend: (playerId: string) => void;
    /**
     * Whether the viewer cleared their board. Passed by the dialog, which
     * already knows the outcome, rather than re-derived from state here.
     */
    won?: boolean;
}

/**
 * What the run amounted to, derived from state the client already holds. Co-op
 * ends on the scoreboard; PVP is a race, where the only number that settles
 * anything is how far each player got.
 */
export default function GameSummary({ addRoomFriend, won = false }: GameSummaryProps) {
    const relaxed = useMinesweeperStore((state) => state.relaxed);
    const lives = useMinesweeperStore((state) => state.livesRemaining);
    const mode = useMinesweeperStore((state) => state.mode);
    const startedAt = useMinesweeperStore((state) => state.startedAt);
    const endedAt = useMinesweeperStore((state) => state.endedAt);
    const playerStatsInRoom = useMinesweeperStore((state) => state.playerStatsInRoom);
    const pvpOpponentName = useMinesweeperStore((state) => state.pvpOpponentName);

    const { ownProgress, safeCells, ownProgressPercent, opponentProgressPercent } = useGameStats();

    const duration =
        startedAt !== null && endedAt !== null ? formatClock(elapsedSeconds(startedAt, endedAt)) : null;

    const isPvp = mode === 'pvp';

    return (
        <div className="flex flex-col gap-4">
            {!isPvp && relaxed && <p className="text-pixel-xs text-center m-0">Standard co-op · {lives} / 3 lives remaining</p>}
            <dl className="flex justify-center gap-8 m-0">
                {duration && <Stat label="Time" value={duration} />}
                {isPvp ? (
                    <>
                        <Stat label="You" value={`${ownProgressPercent}%`} />
                        <Stat label={pvpOpponentName || 'Opponent'} value={`${opponentProgressPercent}%`} />
                    </>
                ) : (
                    <>
                        <Stat label="Cleared" value={`${ownProgressPercent}%`} />
                        <Stat label="Cells" value={`${ownProgress}/${safeCells}`} />
                    </>
                )}
            </dl>

            <BestTimeNote />

            {!isPvp && playerStatsInRoom.length > 0 && (
                <div className="overflow-x-auto">
                    <ScoreTable />
                </div>
            )}

            {/* Both modes: a quick match pairs strangers, the case this exists for. */}
            <AddFriendsFromGame addRoomFriend={addRoomFriend} />

            {/* Only after a clear: asking for a tip over a loss reads badly. */}
            {won && (
                <p className="text-center m-0">
                    <SupportLink className="text-pixel-xs text-ink-muted" iconSize={16} />
                </p>
            )}
        </div>
    );
}
