/**
 * Grid Component
 * Game screen layout. The board, status banner, progress bars, score table and
 * flag counter all live in components/game/ and are shared by both layouts.
 *
 * The arrangements genuinely differ, so they are separate markup rather than
 * copies: desktop puts controls in sticky side panels either side of the board;
 * mobile puts the BOARD FIRST, with a compact sticky HUD above it and
 * everything else below. The content of both is written once.
 *
 * Mobile is split around the board on purpose. The controls used to sit above
 * it, which put ~420px of chrome ahead of the game on a 375px screen — the
 * product below the fold on the devices most players arrive from.
 *
 * The BOARD is not duplicated. It used to be rendered inside each arrangement,
 * which put two copies of every cell in the DOM — 512 for a 16x16 game — and
 * re-rendered both on every update. Everything sits on one flex line with a
 * single board between the clusters, so exactly one board is mounted and CSS
 * decides what is visible. DOM order alone does that; no `order` juggling.
 */
import React, { useEffect } from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Dialog, DialogClose, Panel, Switch, TrophyIcon } from '@/components/ds';
import Board from '@/components/game/Board';
import StatusBanner from '@/components/game/StatusBanner';
import ProgressBar, { opponentBarColor } from '@/components/game/ProgressBar';
import ScoreTable from '@/components/game/ScoreTable';
import FlagCounter from '@/components/game/FlagCounter';
import Timer from '@/components/game/Timer';
import RoomPanel from '@/components/game/RoomPanel';
import { useGameStats } from '@/hooks/useGameStats';
import { DIALOGS, openDialog } from '@/lib/dialogs';

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
    const openPlayersDialog = () => openDialog(DIALOGS.players);

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
                <Button
                    intent="primary"
                    size="sm"
                    onClick={resetGame}
                    aria-label="Reset game board with new mine placement">
                    Reset Board
                </Button>
            }
            {/* PVP: Reset My Board button (only when player failed but game not over) */}
            {mode === 'pvp' && gameOver && !gameWon && !pvpWinner &&
                <Button
                    intent="primary"
                    size="sm"
                    onClick={resetMyBoard}
                    aria-label="Reset your board after hitting a mine">
                    Reset My Board
                </Button>
            }
            {/* PVP: Rematch button (host only, after game ends) */}
            {mode === 'pvp' && pvpWinner && pvpIsHost &&
                <Button
                    intent="success"
                    size="sm"
                    onClick={pvpRematch}
                    aria-label="Start a rematch">
                    Rematch
                </Button>
            }
        </>
    );

    const leaveButton = (
        <Button
            intent="warning"
            size="sm"
            onClick={leaveRoom}
            aria-label="Leave room and return to home page">
            Return to Home
        </Button>
    );

    return (
        <>
            <div className="w-full max-w-[1350px] mx-auto px-4 min-h-[94vh] pt-10 pb-6 xl:pt-20 xl:pb-16">

                <h1 className="text-center font-bold text-pixel-2xl md:text-pixel-4xl">Minesweeper Co-Op</h1>

                {/* ARIA live region for game status announcements */}
                <div aria-live="assertive" aria-atomic="true" className="sr-only">
                    {gameWon && "Game won! All mines have been found."}
                    {gameOver && "Game over! A mine was triggered."}
                </div>

                {/*
                  * One flex line that is a row on desktop and a column below it.
                  *
                  * The DOM order — mobile controls, desktop-left, board,
                  * desktop-right — is what makes both arrangements work without
                  * any `order` juggling: whichever cluster does not belong to the
                  * current breakpoint is display:none and drops out of the flex
                  * line entirely. Mobile then reads controls-then-board, desktop
                  * reads left-board-right.
                  */}
                <div className="flex flex-col items-center gap-0 mt-10 xl:flex-row xl:items-start xl:justify-around xl:gap-20 xl:mt-16">

                    {/* ------------------------------------------------------------ */}
                    {/* MOBILE: a compact HUD, pinned above the board                 */}
                    {/* ------------------------------------------------------------ */}
                    <div className="xl:hidden sticky top-0 z-10 w-full bg-surface-page border-b-pixel border-edge flex items-center justify-between gap-3 px-2 py-1">
                        <FlagCounter remainingFlags={remainingFlags} variant="hud" />
                        <Timer variant="hud" />
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={isChecked}
                                onChange={setIsChecked}
                                aria-label={`Toggle between click and flag mode. Currently in ${isChecked ? "click" : "flag"} mode`}
                            />
                            <span className="text-pixel-sm" aria-hidden="true">
                                {isChecked ? "Click" : "Flag"}
                            </span>
                        </div>
                        {mode !== 'pvp' &&
                            <button
                                type="button"
                                onClick={openPlayersDialog}
                                aria-label="View player scores"
                                className="cursor-pointer shrink-0">
                                <TrophyIcon size={28} />
                            </button>
                        }
                    </div>

                    {/* ------------------------------------------------------------ */}
                    {/* DESKTOP: sticky side panels either side of the board          */}
                    {/* ------------------------------------------------------------ */}
                    <div className="hidden xl:flex flex-col sticky top-20">
                        {leaveButton}
                        <RoomPanel className="max-w-60 mt-6" />
                    </div>

                    {/*
                      * The board, mounted ONCE.
                      *
                      * It used to be rendered in each layout, so a 16x16 game put
                      * 512 cells in the DOM and re-rendered both copies on every
                      * update. It also meant every DOM query — in tests and in the
                      * app — had to work out which copy was the visible one.
                      *
                      * The banner above it still has a variant per layout, so both
                      * are rendered and one is hidden. That is two small nodes
                      * rather than a second board.
                      */}
                    <div
                        className="overflow-scroll xl:overflow-visible max-w-full"
                        role="region"
                        aria-label="Game board container">
                        <div className="hidden xl:block">
                            <StatusBanner startPvpGame={startPvpGame} emitConfetti={emitConfetti} variant="desktop" />
                        </div>
                        <div className="xl:hidden">
                            <StatusBanner startPvpGame={startPvpGame} emitConfetti={emitConfetti} variant="mobile" />
                        </div>
                        <Board {...boardProps} />
                    </div>

                    {/* ------------------------------------------------------------ */}
                    {/* MOBILE: everything else, below the board                     */}
                    {/*                                                              */}
                    {/* The board comes FIRST on a phone. It used to sit under ~420px */}
                    {/* of chrome, so the game was below the fold on the screens most */}
                    {/* players arrive on. Splitting the mobile controls around the   */}
                    {/* board keeps DOM order doing the work — still exactly one      */}
                    {/* <Board>, still no `order` juggling.                           */}
                    {/* ------------------------------------------------------------ */}
                    <div className="flex flex-col items-center gap-2 xl:hidden mt-6 w-full">
                        {mode === 'pvp' && pvpStarted &&
                            <div className="w-full max-w-60 mb-4">
                                <div className="mb-2">
                                    <ProgressBar label="You" percent={ownProgressPercent} colorClass="bg-progress-own" size="sm" />
                                </div>
                                <div>
                                    <ProgressBar
                                        label={pvpOpponentName}
                                        percent={opponentProgressPercent}
                                        colorClass={opponentBarColor(pvpOpponentStatus)}
                                        size="sm"
                                    />
                                </div>
                            </div>
                        }

                        <div className="flex items-center gap-8">
                            {leaveButton}
                            {actionButtons}
                        </div>

                        <RoomPanel className="my-6 max-w-60" centered />
                    </div>

                    <div className="hidden xl:flex flex-col sticky top-20">
                        {actionButtons}
                        {/* PVP: Waiting for rematch (non-host, after game ends) */}
                        {mode === 'pvp' && pvpWinner && !pvpIsHost &&
                            <div className="text-pixel-sm text-ink-muted mt-2">
                                Waiting for host to start rematch...
                            </div>
                        }
                        {/* PVP: Progress bars and opponent status */}
                        {mode === 'pvp' && pvpStarted &&
                            <Panel
                                title={<span className="text-pixel-sm">Progress</span>}
                                className="max-w-60 mt-6"
                                role="region"
                                aria-label="Game progress">

                                <div className="mb-4">
                                    <ProgressBar
                                        label="You"
                                        percent={ownProgressPercent}
                                        colorClass="bg-progress-own"
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
                                <p className="text-pixel-sm mt-3">
                                    Status: <span className={
                                        pvpOpponentStatus === 'won' ? 'text-status-won' :
                                        pvpOpponentStatus === 'failed' ? 'text-status-failed' :
                                        pvpOpponentStatus === 'playing' ? 'text-status-playing' :
                                        'text-status-idle'
                                    }>
                                        {pvpOpponentStatus === 'won' ? '✓ Won' :
                                         pvpOpponentStatus === 'failed' ? '✗ Hit a mine' :
                                         pvpOpponentStatus === 'disconnected' ? '✗ Disconnected' :
                                         pvpOpponentStatus === 'playing' ? '▶ Playing' :
                                         '⏳ Waiting'}
                                    </span>
                                </p>
                            </Panel>
                        }

                        <div className="overflow-x-auto mt-6" role="region" aria-label="Player scores">
                            {/* Score table - only show in co-op mode */}
                            {mode !== 'pvp' && <ScoreTable />}
                            <FlagCounter remainingFlags={remainingFlags} variant="panel" />
                            <Timer variant="panel" />
                        </div>
                    </div>
                </div>
            </div>

            <Dialog
                id={DIALOGS.players}
                title="Players Online!"
                actions={<DialogClose aria-label="Close players dialog">Cancel</DialogClose>}>
                <div className="overflow-x-auto mt-6">
                    <ScoreTable nameWidthClass="max-w-60" />
                    <FlagCounter remainingFlags={remainingFlags} variant="dialog" />
                </div>
            </Dialog>
        </>
    )
});

Grid.displayName = 'Grid';

export default Grid;
