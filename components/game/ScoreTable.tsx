import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { NameWithAvatar, Table } from '@/components/ds';

export interface ScoreTableProps {
    /** Desktop caps names narrower than the mobile dialog does. */
    nameWidthClass?: string;
}

/** Player/score leaderboard. Co-op only — PVP hides it in both layouts. */
export default function ScoreTable({ nameWidthClass = 'max-w-40' }: ScoreTableProps) {
    const playerStatsInRoom = useMinesweeperStore((state) => state.playerStatsInRoom);

    return (
        <Table aria-label="Leaderboard showing player names and scores">
            <thead>
                <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Score</th>
                </tr>
            </thead>
            <tbody>
                {playerStatsInRoom.map((item, index) => (
                    <tr key={index}>
                        <td className={`text-pixel-md ${nameWidthClass}`}>
                            <NameWithAvatar avatar={item.avatar}>{item.name}</NameWithAvatar>
                        </td>
                        <td className="text-pixel-md">{item.score}</td>
                    </tr>
                ))}
            </tbody>
        </Table>
    );
}
