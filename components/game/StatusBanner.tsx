import React from 'react';
import { Center } from "@chakra-ui/react";
import { useMinesweeperStore } from '@/app/store';

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
        ? <p className="text-sm mb-2">Opponent: <strong>{pvpOpponentName}</strong></p>
        : <p className="text-sm mb-2">vs <strong>{pvpOpponentName}</strong></p>;

    return (
        <Center>
            {/* PVP: Waiting for second player */}
            {mode === 'pvp' && !pvpRoomReady && !pvpStarted &&
                <div className="pb-12" role="status" aria-label="Waiting for opponent">
                    <p className="text-sm">Waiting for opponent...</p>
                </div>
            }
            {/* PVP: Room ready, host sees start button */}
            {mode === 'pvp' && pvpRoomReady && !pvpStarted && pvpIsHost &&
                <div className="pb-12 text-center">
                    {opponentLine}
                    <button
                        type="button"
                        className="nes-btn is-success"
                        style={{ color: 'black' }}
                        onClick={startPvpGame}
                        aria-label="Start PVP game">
                        Start Game
                    </button>
                </div>
            }
            {/* PVP: Room ready, non-host waits for host to start */}
            {mode === 'pvp' && pvpRoomReady && !pvpStarted && !pvpIsHost &&
                <div className="pb-12 text-center">
                    {opponentLine}
                    <p className="text-sm">{isDesktop ? 'Waiting for host to start...' : 'Waiting for host...'}</p>
                </div>
            }
            {/* Co-op or PVP game won */}
            {gameWon &&
                <div className="nes-badge pb-12" role="status" aria-label="Game won">
                    <span className="is-success" onClick={emitConfetti}>
                        {mode === 'pvp' && pvpWinner ? `${pvpWinner} WON!` : 'GAME WON!'}
                    </span>
                </div>
            }
            {/* Co-op game lost */}
            {gameOver && mode === 'co-op' &&
                <div className="nes-badge pb-12" role="status" aria-label="Game lost">
                    <span className="is-error">GAME LOST!</span>
                </div>
            }
            {/* PVP: This player lost */}
            {gameOver && mode === 'pvp' && !gameWon &&
                <div className="nes-badge pb-12" role="status" aria-label={isDesktop ? 'You hit a mine' : 'Hit a mine'}>
                    <span className="is-error">HIT A MINE!</span>
                </div>
            }
        </Center>
    );
}
