import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import ScoreTable from '@/components/game/ScoreTable';
import { useGameStats } from '@/hooks/useGameStats';
import { elapsedSeconds, formatClock } from '@/lib/gameClock';
import BestTimeNote from '@/components/game/BestTimeNote';
import AddFriendsFromGame from '@/components/game/AddFriendsFromGame';

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
    requestRoomFriends: () => void;
    addRoomFriend: (playerId: string) => void;
}

/**
 * What the run amounted to: how long, how much of the board, and who did it.
 *
 * All derived from state the client already holds — a summary is a different
 * *view* of a finished game, not new information, so it needs no payload.
 *
 * The two modes read differently: co-op is a shared result and ends on the
 * scoreboard; PVP is a race, where the only number that settles anything is how
 * far each player got.
 */
export default function GameSummary({ requestRoomFriends, addRoomFriend }: GameSummaryProps) {
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

            {/* Both modes: a quick match pairs strangers, which is the case
                this exists for. */}
            <AddFriendsFromGame
                requestRoomFriends={requestRoomFriends}
                addRoomFriend={addRoomFriend}
            />
        </div>
    );
}
