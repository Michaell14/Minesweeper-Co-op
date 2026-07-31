import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Badge, Button } from '@/components/ds';

export interface StatusBannerProps {
    startPvpGame: () => void;
    emitConfetti: () => void;
    /**
     * The two layouts word the PVP waiting states differently. Kept as an
     * explicit choice rather than the accidental drift it used to be:
     *   desktop -> "Opponent: X" / "Waiting for host to start..."
     *   mobile  -> "vs X"        / "Waiting for host..."
     */
    variant: 'desktop' | 'mobile';
}

/**
 * The strip above the board: PVP lobby states, then win/loss badges.
 */
export default function StatusBanner({ startPvpGame, emitConfetti, variant }: StatusBannerProps) {
    const mode = useMinesweeperStore((state) => state.mode);
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const gameWon = useMinesweeperStore((state) => state.gameWon);
    const pvpStarted = useMinesweeperStore((state) => state.pvpStarted);
    const pvpRoomReady = useMinesweeperStore((state) => state.pvpRoomReady);
    const pvpIsHost = useMinesweeperStore((state) => state.pvpIsHost);
    const pvpOpponentName = useMinesweeperStore((state) => state.pvpOpponentName);
    const pvpWinner = useMinesweeperStore((state) => state.pvpWinner);

    const isDesktop = variant === 'desktop';
    const opponentLine = isDesktop
        ? <p className="text-pixel-md mb-2">Opponent: <strong>{pvpOpponentName}</strong></p>
        : <p className="text-pixel-md mb-2">vs <strong>{pvpOpponentName}</strong></p>;

    return (
        <div className="flex items-center justify-center">
            {/* PVP: Waiting for second player */}
            {mode === 'pvp' && !pvpRoomReady && !pvpStarted &&
                <div className="pb-12" role="status" aria-label="Waiting for opponent">
                    <p className="text-pixel-md">Waiting for opponent...</p>
                </div>
            }
            {/* PVP: Room ready, host sees start button */}
            {mode === 'pvp' && pvpRoomReady && !pvpStarted && pvpIsHost &&
                <div className="pb-12 text-center">
                    {opponentLine}
                    {/*
                      * The old markup forced black ink here with an inline
                      * style, overriding the white NES.css gives a success
                      * button. The intent's ink is a token now, so the one-off
                      * is gone — if success text should be dark, that is a
                      * decision for --ms-intent-success-ink.
                      */}
                    <Button
                        intent="success"
                        onClick={startPvpGame}
                        aria-label="Start PVP game">
                        Start Game
                    </Button>
                </div>
            }
            {/* PVP: Room ready, non-host waits for host to start */}
            {mode === 'pvp' && pvpRoomReady && !pvpStarted && !pvpIsHost &&
                <div className="pb-12 text-center">
                    {opponentLine}
                    <p className="text-pixel-md">{isDesktop ? 'Waiting for host to start...' : 'Waiting for host...'}</p>
                </div>
            }
            {/* Co-op or PVP game won */}
            {gameWon &&
                <div className="pb-12" role="status" aria-label="Game won">
                    <Badge intent="success" onClick={emitConfetti}>
                        {mode === 'pvp' && pvpWinner ? `${pvpWinner} WON!` : 'GAME WON!'}
                    </Badge>
                </div>
            }
            {/* Co-op game lost */}
            {gameOver && mode === 'co-op' &&
                <div className="pb-12" role="status" aria-label="Game lost">
                    <Badge intent="error">GAME LOST!</Badge>
                </div>
            }
            {/* PVP: This player lost */}
            {gameOver && mode === 'pvp' && !gameWon &&
                <div className="pb-12" role="status" aria-label={isDesktop ? 'You hit a mine' : 'Hit a mine'}>
                    <Badge intent="error">HIT A MINE!</Badge>
                </div>
            }
        </div>
    );
}
