import React from 'react';
import { useMinesweeperStore } from '@/app/store';

export interface ScoreTableProps {
    /** Desktop caps names narrower than the mobile dialog does. */
    nameWidthClass?: string;
}

/** Player/score leaderboard. Co-op only — PVP hides it in both layouts. */
export default function ScoreTable({ nameWidthClass = 'max-w-40' }: ScoreTableProps) {
    const playerStatsInRoom = useMinesweeperStore((state) => state.playerStatsInRoom);

    return (
        <table className="nes-table is-bordered is-centered" aria-label="Leaderboard showing player names and scores">
            <thead>
                <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Score</th>
                </tr>
            </thead>
            <tbody>
                {playerStatsInRoom.map((item, index) => (
                    <tr key={index}>
                        <td className={`text-sm ${nameWidthClass}`}>{item.name}</td>
                        <td className="text-sm">{item.score}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
