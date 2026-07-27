/**
 * Grid Component
 * Game screen layout. The board, status banner, progress bars, score table and
 * flag counter all live in components/game/ and are shared by both layouts.
 *
 * Two layouts remain, because they are genuinely different arrangements rather
 * than copies: desktop puts controls in sticky side panels either side of the
 * board, mobile stacks them above a scrollable board and swaps the inline score
 * table for a trophy dialog. What used to be duplicated was the *content* of
 * those arrangements, which is now written once.
 */
import React, { useEffect } from 'react';
import { Center, Container, HStack, VStack, Box } from "@chakra-ui/react";
import { useMinesweeperStore } from '@/app/store';
import { Switch } from "@/components/ui/switch";
import Board from '@/components/game/Board';
import StatusBanner from '@/components/game/StatusBanner';
import ProgressBar, { opponentBarColor } from '@/components/game/ProgressBar';
import ScoreTable from '@/components/game/ScoreTable';
import FlagCounter from '@/components/game/FlagCounter';
import { useGameStats } from '@/hooks/useGameStats';

/**
 * Grid Component Props
 * Functions passed from parent (Home) component
 */
interface GridParams {
    leaveRoom: () => void;          // Leave current room and return to landing
    resetGame: () => void;          // Reset board with new mine placement
    toggleFlag: (row: number, col: number) => void; // Flag/unflag a cell
    openCell: (row: number, col: number) => void;   // Reveal a cell
    chordCell: (row: number, col: number) => void;  // Middle-click chord action
    emitConfetti: () => void;       // Send confetti to all players
    emitCellHover: (row: number, col: number) => void; // Emit cell hover
    handleBoardLeave: () => void;   // Clear hover when leaving board
    startPvpGame: () => void;       // PVP: Start game when ready
    resetMyBoard: () => void;       // PVP: Reset only this player's board
    pvpRematch: () => void;         // PVP: Request rematch (host only)
}

const Grid = React.memo(({ leaveRoom, resetGame, toggleFlag, openCell, chordCell, emitConfetti, emitCellHover, handleBoardLeave, startPvpGame, resetMyBoard, pvpRematch }: GridParams) => {
    const r = useMinesweeperStore((state) => state.r);
    const c = useMinesweeperStore((state) => state.c);
    const leftClick = useMinesweeperStore((state) => state.leftClick);
    const rightClick = useMinesweeperStore((state) => state.rightClick);
    const isChecked = useMinesweeperStore((state) => state.isChecked);
    const room = useMinesweeperStore((state) => state.room);
    const mode = useMinesweeperStore((state) => state.mode);
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const gameWon = useMinesweeperStore((state) => state.gameWon);
    const pvpStarted = useMinesweeperStore((state) => state.pvpStarted);
    const pvpWinner = useMinesweeperStore((state) => state.pvpWinner);
    const pvpIsHost = useMinesweeperStore((state) => state.pvpIsHost);
    const pvpOpponentName = useMinesweeperStore((state) => state.pvpOpponentName);
    const pvpOpponentStatus = useMinesweeperStore((state) => state.pvpOpponentStatus);
    const setIsChecked = useMinesweeperStore((state) => state.setIsChecked);
    const setBothPressed = useMinesweeperStore((state) => state.setBothPressed);

    const { remainingFlags, ownProgressPercent, opponentProgressPercent } = useGameStats();

    const boardProps = { toggleFlag, openCell, chordCell, emitCellHover, handleBoardLeave };

    /**
     * Open the player stats dialog (mobile view only)
     */
    const openPlayersDialog = () => {
        (document.getElementById('dialog-players') as HTMLDialogElement)?.showModal();
    };

    // ============================================================================
    // CHORDING DETECTION
    // ============================================================================

    /**
     * Detect when both mouse buttons are pressed simultaneously
     * This enables "chording" - opening all unflagged neighbors of a satisfied number
     * Pattern: Press left + right buttons together on an opened numbered cell
     *
     * Note: chordCell is memoized in parent to prevent infinite loops
     * Note: setBothPressed is a stable Zustand setter (doesn't need dependency)
     */
    useEffect(() => {
        // Check if both buttons are pressed
        if (leftClick && rightClick) {
            setBothPressed(true);
            // Only chord if we have valid coordinates
            if (r >= 0 && c >= 0) {
                chordCell(r, c);
            }
            return;
        }

        // Release lock when both buttons are released
        if (!leftClick && !rightClick) {
            setBothPressed(false);
        }
    }, [leftClick, rightClick, r, c, chordCell, setBothPressed]);

    /** Reset / rematch controls, shared by both layouts. */
    const actionButtons = (
        <>
            {/* Co-op: Reset Board button */}
            {mode === 'co-op' &&
                <button
                    type="button"
                    className="nes-btn text-xs is-primary"
                    onClick={resetGame}
                    aria-label="Reset game board with new mine placement">
                    Reset Board
                </button>
            }
            {/* PVP: Reset My Board button (only when player failed but game not over) */}
            {mode === 'pvp' && gameOver && !gameWon && !pvpWinner &&
                <button
                    type="button"
                    className="nes-btn text-xs is-primary"
                    onClick={resetMyBoard}
                    aria-label="Reset your board after hitting a mine">
                    Reset My Board
                </button>
            }
            {/* PVP: Rematch button (host only, after game ends) */}
            {mode === 'pvp' && pvpWinner && pvpIsHost &&
                <button
                    type="button"
                    className="nes-btn text-xs is-success"
                    onClick={pvpRematch}
                    aria-label="Start a rematch">
                    Rematch
                </button>
            }
        </>
    );

    const roomPanel = (extraClass: string) => (
        <div className={extraClass} role="region" aria-label="Room information">
            <p className="title text-xs">Room:</p>
            <p className="text-sm" aria-label={`Room code: ${room}`}> {room}</p>
        </div>
    );

    const leaveButton = (
        <button
            type="button"
            className="nes-btn is-warning text-xs"
            onClick={leaveRoom}
            aria-label="Leave room and return to home page">
            Return to Home
        </button>
    );

    return (
        <>
            <Container minH={"94vh"} pb={{ base: 6, xl: 16 }} maxW={"1350px"} pt={{ base: 10, xl: 20 }}>

                <h1 className="text-center font-bold text-2xl md:text-4xl">Minesweeper Co-Op</h1>

                {/* ARIA live region for game status announcements */}
                <div aria-live="assertive" aria-atomic="true" className="sr-only">
                    {gameWon && "Game won! All mines have been found."}
                    {gameOver && "Game over! A mine was triggered."}
                </div>

                {/* ---------------------------------------------------------------- */}
                {/* DESKTOP: sticky side panels either side of the board              */}
                {/* ---------------------------------------------------------------- */}
                <Center hideBelow={"xl"} justifyContent={"space-around"} alignItems={"flex-start"} mt={16} gap={20}>
                    <div className="flex flex-col sticky top-20">
                        {leaveButton}
                        {roomPanel("bg-slate-100 nes-container with-title max-w-60 mt-6")}
                    </div>
                    <div>
                        <StatusBanner startPvpGame={startPvpGame} emitConfetti={emitConfetti} variant="desktop" />
                        <Board {...boardProps} />
                    </div>
                    <div className="flex flex-col sticky top-20">
                        {actionButtons}
                        {/* PVP: Waiting for rematch (non-host, after game ends) */}
                        {mode === 'pvp' && pvpWinner && !pvpIsHost &&
                            <div className="text-xs text-gray-600 mt-2">
                                Waiting for host to start rematch...
                            </div>
                        }
                        {/* PVP: Progress bars and opponent status */}
                        {mode === 'pvp' && pvpStarted &&
                            <div className="bg-slate-100 nes-container with-title max-w-60 mt-6" role="region" aria-label="Game progress">
                                <p className="title text-xs">Progress</p>

                                <div className="mb-4">
                                    <ProgressBar
                                        label="You"
                                        percent={ownProgressPercent}
                                        colorClass="bg-blue-500"
                                        ariaLabel={`Your progress: ${ownProgressPercent}%`}
                                        boldPercent
                                    />
                                </div>

                                <div className="mb-2">
                                    <ProgressBar
                                        label={pvpOpponentName || 'Opponent'}
                                        percent={opponentProgressPercent}
                                        colorClass={opponentBarColor(pvpOpponentStatus)}
                                        ariaLabel={`Opponent progress: ${opponentProgressPercent}%`}
                                        boldPercent
                                    />
                                </div>

                                {/* Opponent status */}
                                <p className="text-xs mt-3">
                                    Status: <span className={
                                        pvpOpponentStatus === 'won' ? 'text-green-600' :
                                        pvpOpponentStatus === 'failed' ? 'text-red-600' :
                                        pvpOpponentStatus === 'disconnected' ? 'text-gray-600' :
                                        pvpOpponentStatus === 'playing' ? 'text-blue-600' :
                                        'text-gray-600'
                                    }>
                                        {pvpOpponentStatus === 'won' ? '✓ Won' :
                                         pvpOpponentStatus === 'failed' ? '✗ Hit a mine' :
                                         pvpOpponentStatus === 'disconnected' ? '✗ Disconnected' :
                                         pvpOpponentStatus === 'playing' ? '▶ Playing' :
                                         '⏳ Waiting'}
                                    </span>
                                </p>
                            </div>
                        }

                        <div className="nes-table-responsive mt-6" role="region" aria-label="Player scores">
                            {/* Score table - only show in co-op mode */}
                            {mode !== 'pvp' && <ScoreTable />}
                            <FlagCounter remainingFlags={remainingFlags} variant="panel" />
                        </div>
                    </div>
                </Center>

                {/* ---------------------------------------------------------------- */}
                {/* MOBILE: controls stacked above a scrollable board                 */}
                {/* ---------------------------------------------------------------- */}
                <Center hideFrom={"xl"} mt={10}>
                    <VStack>
                        <HStack gap={8}>
                            {leaveButton}
                            {actionButtons}
                        </HStack>

                        <HStack gap={8}>
                            {roomPanel("my-6 bg-slate-100 nes-container is-centered with-title max-w-60")}
                            {/* Trophy button - only show in co-op mode */}
                            {mode !== 'pvp' &&
                                <button
                                    className="nes-icon trophy is-medium"
                                    onClick={openPlayersDialog}
                                    aria-label="View player scores"
                                    style={{ border: 'none', background: 'none', cursor: 'pointer' }}
                                />
                            }
                        </HStack>

                        {/* PVP: Progress bars and flag counter for mobile */}
                        {mode === 'pvp' && pvpStarted &&
                            <div className="w-full max-w-60 mb-4">
                                <div className="mb-2">
                                    <ProgressBar label="You" percent={ownProgressPercent} colorClass="bg-blue-500" size="sm" />
                                </div>
                                <div>
                                    <ProgressBar
                                        label={pvpOpponentName}
                                        percent={opponentProgressPercent}
                                        colorClass={opponentBarColor(pvpOpponentStatus)}
                                        size="sm"
                                    />
                                </div>
                                <FlagCounter remainingFlags={remainingFlags} variant="inline" />
                            </div>
                        }

                        <Box hideFrom={"xl"}>
                            <HStack gap={5}>
                                <Switch
                                    defaultChecked
                                    onCheckedChange={(e) => setIsChecked(e.checked)}
                                    size="lg"
                                    colorScheme="blue"
                                    aria-label={`Toggle between click and flag mode. Currently in ${isChecked ? "click" : "flag"} mode`}
                                />
                                <p className="mt-1.5" aria-hidden="true">{isChecked ? "Click" : "Flag"} Mode</p>
                            </HStack>
                        </Box>
                    </VStack>
                </Center>
                <Center hideFrom={"xl"} mt={5}>
                    <div className="overflow-scroll" role="region" aria-label="Game board container">
                        <StatusBanner startPvpGame={startPvpGame} emitConfetti={emitConfetti} variant="mobile" />
                        <Board {...boardProps} />
                    </div>
                </Center>
            </Container>

            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-players"
                aria-labelledby="players-dialog-title">
                <form method="dialog">
                    <p id="players-dialog-title" className="title">Players Online!</p>
                    <div className="nes-table-responsive mt-6">
                        <ScoreTable nameWidthClass="max-w-60" />
                        <FlagCounter remainingFlags={remainingFlags} variant="dialog" />
                    </div>
                    <menu className="dialog-menu justify-end flex mt-6">
                        <button className="nes-btn" aria-label="Close players dialog">Cancel</button>
                    </menu>
                </form>
            </dialog>
        </>
    )
});

Grid.displayName = 'Grid';

export default Grid;
