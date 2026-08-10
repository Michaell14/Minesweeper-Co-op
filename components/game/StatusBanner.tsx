import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Badge, Button, NameWithAvatar } from '@/components/ds';

export interface StatusBannerProps {
    startPvpGame: () => void;
    emitConfetti: () => void;
    /**
     * The two layouts word the PVP waiting states differently, deliberately:
     *   desktop -> "Opponent: X" / "Waiting for host to start..."
     *   mobile  -> "vs X"        / "Waiting for host..."
     */
    variant: 'desktop' | 'mobile';
}

/** The strip above the board: PVP lobby states, then win/loss badges. */
export default function StatusBanner({ startPvpGame, emitConfetti, variant }: StatusBannerProps) {
    const mode = useMinesweeperStore((state) => state.mode);
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const gameWon = useMinesweeperStore((state) => state.gameWon);
    const pvpStarted = useMinesweeperStore((state) => state.pvpStarted);
    const pvpRoomReady = useMinesweeperStore((state) => state.pvpRoomReady);
    const pvpIsHost = useMinesweeperStore((state) => state.pvpIsHost);
    const pvpOpponentName = useMinesweeperStore((state) => state.pvpOpponentName);
    const pvpOpponentAvatar = useMinesweeperStore((state) => state.pvpOpponentAvatar);
    const pvpWinner = useMinesweeperStore((state) => state.pvpWinner);

    const isDesktop = variant === 'desktop';
    const opponentWithAvatar = (
        <NameWithAvatar avatar={pvpOpponentAvatar} size={24}>
            <strong>{pvpOpponentName}</strong>
        </NameWithAvatar>
    );
    const opponentLine = isDesktop
        ? <p className="text-pixel-md mb-2">Opponent: {opponentWithAvatar}</p>
        : <p className="text-pixel-md mb-2">vs {opponentWithAvatar}</p>;

    return (
        <div className="flex items-center justify-center">
            {mode === 'pvp' && !pvpRoomReady && !pvpStarted &&
                <div className="pb-12" role="status" aria-label="Waiting for opponent">
                    <p className="text-pixel-md">Waiting for opponent...</p>
                </div>
            }
            {mode === 'pvp' && pvpRoomReady && !pvpStarted && pvpIsHost &&
                <div className="pb-12 text-center">
                    {opponentLine}
                    <Button
                        intent="success"
                        onClick={startPvpGame}
                        aria-label="Start PVP game">
                        Start Game
                    </Button>
                </div>
            }
            {mode === 'pvp' && pvpRoomReady && !pvpStarted && !pvpIsHost &&
                <div className="pb-12 text-center">
                    {opponentLine}
                    <p className="text-pixel-md">{isDesktop ? 'Waiting for host to start...' : 'Waiting for host...'}</p>
                </div>
            }
            {gameWon &&
                <div className="pb-12" role="status" aria-label="Game won">
                    <Badge intent="success" onClick={emitConfetti}>
                        {mode === 'pvp' && pvpWinner ? `${pvpWinner} WON!` : 'GAME WON!'}
                    </Badge>
                </div>
            }
            {gameOver && mode === 'co-op' &&
                <div className="pb-12" role="status" aria-label="Game lost">
                    <Badge intent="error">GAME LOST!</Badge>
                </div>
            }
            {gameOver && mode === 'pvp' && !gameWon &&
                <div className="pb-12" role="status" aria-label={isDesktop ? 'You hit a mine' : 'Hit a mine'}>
                    <Badge intent="error">HIT A MINE!</Badge>
                </div>
            }
        </div>
    );
}
