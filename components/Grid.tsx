/**
 * Game screen layout. The board, status banner, progress bars, score table and
 * flag counter live in components/game/ and are shared by both layouts.
 *
 * The two arrangements genuinely differ, so they are separate markup: desktop
 * puts controls in sticky side panels either side of the board; mobile puts the
 * BOARD FIRST, with a compact sticky HUD above it and everything else below,
 * because ~420px of chrome ahead of the game puts it below the fold on a phone.
 *
 * The BOARD is mounted exactly ONCE — everything sits on one flex line with the
 * single board between the clusters, and CSS decides which cluster is visible.
 * Duplicating it would put 512 cells in the DOM for a 16x16 game and make every
 * DOM query ambiguous. DOM order alone does this; no `order` juggling.
 */
import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Dialog, DialogClose, Panel, Switch, TrophyIcon } from '@/components/ds';
import Board from '@/components/game/Board';
import StatusBanner from '@/components/game/StatusBanner';
import ProgressBar, { opponentBarColor } from '@/components/game/ProgressBar';
import PracticeProgress from '@/components/game/PracticeProgress';
import ScoreTable from '@/components/game/ScoreTable';
import EmoteBar from '@/components/game/EmoteBar';
import InviteFriendDialog from '@/components/game/InviteFriendDialog';
import FlagCounter from '@/components/game/FlagCounter';
import Timer from '@/components/game/Timer';
import RoomPanel from '@/components/game/RoomPanel';
import { useGameStats } from '@/hooks/useGameStats';
import { useChording } from '@/hooks/useChording';
import { useKeyboardControls } from '@/hooks/useKeyboardControls';
import { DIALOGS, openDialog } from '@/lib/dialogs';

/** Actions passed down from Home. */
interface GridParams {
    leaveRoom: () => void;
    resetGame: () => void;
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
    chordCell: (row: number, col: number) => void;
    emitConfetti: () => void;                           // to everyone in the room
    sendEmote: (emote: string) => void;                 // a reaction, to the room
    pingCell: (row: number, col: number) => void;       // "look at this cell"
    inviteFriend: (friendId: string) => void;           // pull a friend into this room
    emitCellHover: (row: number, col: number) => void;
    handleBoardLeave: () => void;                       // clears this player's hover
    startPvpGame: () => void;
    resetMyBoard: () => void;                           // PVP: this player's board only
    pvpRematch: () => void;                             // PVP: host only
}

const Grid = React.memo(({ leaveRoom, resetGame, toggleFlag, openCell, chordCell, emitConfetti, sendEmote, pingCell, inviteFriend, emitCellHover, handleBoardLeave, startPvpGame, resetMyBoard, pvpRematch }: GridParams) => {
    const isChecked = useMinesweeperStore((state) => state.isChecked);
    const mode = useMinesweeperStore((state) => state.mode);
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const gameWon = useMinesweeperStore((state) => state.gameWon);
    const pvpStarted = useMinesweeperStore((state) => state.pvpStarted);
    const pvpWinner = useMinesweeperStore((state) => state.pvpWinner);
    const pvpIsHost = useMinesweeperStore((state) => state.pvpIsHost);
    const pvpOpponentName = useMinesweeperStore((state) => state.pvpOpponentName);
    const pvpOpponentStatus = useMinesweeperStore((state) => state.pvpOpponentStatus);
    const setIsChecked = useMinesweeperStore((state) => state.setIsChecked);
    const showProgressBar = useMinesweeperStore((state) => state.settings.showProgressBar);
    /* Gates the MOUNT, not just the render. PracticeProgress calls useGameStats,
       which walks the whole board twice — hooks run before its own early return,
       so mounting it unconditionally made every co-op and PVP render pay for a
       component that draws nothing. */
    const isPracticeRace = useMinesweeperStore((state) => state.practiceTargetMs !== null);

    const { remainingFlags, ownProgressPercent, opponentProgressPercent } = useGameStats();

    // Both-buttons chording, and clearing the button state on a release that
    // never reaches a cell. See hooks/useChording.ts.
    useChording(chordCell);

    // Arrow-key cursor + reveal/flag keys. See hooks/useKeyboardControls.ts.
    useKeyboardControls({ openCell, toggleFlag, chordCell, emitCellHover, pingCell });

    const boardProps = { toggleFlag, openCell, chordCell, emitCellHover, pingCell, handleBoardLeave };

    /** Mobile only — desktop shows the score table inline. */
    const openPlayersDialog = () => openDialog(DIALOGS.players);

    /** Reset / rematch controls, shared by both layouts. */
    const actionButtons = (
        <>
            {mode === 'co-op' &&
                <Button
                    intent="primary"
                    size="sm"
                    onClick={resetGame}
                    aria-label="Reset game board with new mine placement">
                    Reset Board
                </Button>
            }
            {/* Only while this player has failed but the race is still on. */}
            {mode === 'pvp' && gameOver && !gameWon && !pvpWinner &&
                <Button
                    intent="primary"
                    size="sm"
                    onClick={resetMyBoard}
                    aria-label="Reset your board after hitting a mine">
                    Reset My Board
                </Button>
            }
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
            {/* container-type makes this the box board.module.css measures cells
                against (100cqw). It belongs here, not on the board's own scroll
                container: inline-size containment stops contents contributing to
                the inline size, so on a shrink-to-fit box inside `items-center`
                that box collapsed to 0 and the board floored. */}
            <div className="w-full max-w-[1350px] mx-auto px-4 min-h-[94vh] pt-10 pb-6 xl:pt-20 xl:pb-16 [container-type:inline-size]">

                <h1 className="text-center font-bold text-pixel-2xl md:text-pixel-4xl">Minesweeper Co-Op</h1>

                <div aria-live="assertive" aria-atomic="true" className="sr-only">
                    {gameWon && "Game won! All mines have been found."}
                    {gameOver && "Game over! A mine was triggered."}
                </div>

                {/*
                  * One flex line: a row on desktop, a column below it.
                  *
                  * DOM order — mobile controls, desktop-left, board, desktop-right
                  * — is what makes both arrangements work without any `order`
                  * juggling: the cluster that does not belong to the current
                  * breakpoint is display:none and leaves the flex line entirely.
                  */}
                {/* 24px, not more: `xl:` turns this row on from a 1280px WINDOW
                    and a classic scrollbar leaves 1263px to lay out in, which
                    the board needs to reach its ceiling. */}
                <div className="flex flex-col items-center gap-0 mt-10 xl:flex-row xl:items-start xl:gap-6 xl:mt-16">

                    {/* MOBILE: a compact HUD, pinned above the board. */}
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

                    {/* DESKTOP: sticky side panels either side of the board. */}
                    <div className="hidden xl:flex flex-col sticky top-20">
                        {leaveButton}
                        <RoomPanel className="max-w-60 mt-6" inviteFriend={inviteFriend} />
                    </div>

                    {/*
                      * The board, mounted ONCE. The banner above it does have a
                      * variant per layout, so both render and one is hidden —
                      * two small nodes rather than a second board.
                      *
                      * overflow-auto, not -scroll: `scroll` reserves a gutter even
                      * when nothing overflows, costing the board 15px on
                      * classic-scrollbar platforms.
                      *
                      * On desktop this column is what the fit clamp measures —
                      * the outer container counts room the rails are using.
                      * `flex-1 min-w-0` gives it a width the contents cannot
                      * affect, which is what makes the containment safe.
                      */}
                    <div
                        className="overflow-auto xl:overflow-visible max-w-full xl:flex-1 xl:min-w-0 xl:[container-type:inline-size]"
                        role="region"
                        aria-label="Game board container">
                        {/* Shrink-to-fit, so the HUD takes the BOARD's width. */}
                        <div className="xl:w-fit xl:mx-auto">
                            <div className="hidden xl:block">
                                <StatusBanner startPvpGame={startPvpGame} emitConfetti={emitConfetti} variant="desktop" />
                            </div>
                            <div className="xl:hidden">
                                <StatusBanner startPvpGame={startPvpGame} emitConfetti={emitConfetti} variant="mobile" />
                            </div>
                            {/* DESKTOP HUD: mines left, clock right. */}
                            <div className="hidden xl:flex items-center gap-6 pb-2">
                                <FlagCounter remainingFlags={remainingFlags} variant="bar" />
                                {/* ml-auto, not justify-between: either number
                                    can be switched off in settings. */}
                                <div className="ml-auto">
                                    <Timer variant="bar" />
                                </div>
                            </div>
                            <Board {...boardProps} />
                            {/* Under the board, inside the one container that
                                both layouts share — so the tray is mounted once,
                                the same rule the board itself follows. */}
                            <EmoteBar sendEmote={sendEmote} />
                        </div>
                    </div>

                    {/* MOBILE: everything else, below the board. */}
                    <div className="flex flex-col items-center gap-2 xl:hidden mt-6 w-full">
                        {mode === 'pvp' && pvpStarted && showProgressBar &&
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

                        {isPracticeRace && <PracticeProgress variant="mobile" />}

                        <div className="flex items-center gap-8">
                            {leaveButton}
                            {actionButtons}
                        </div>

                        <RoomPanel className="my-6 max-w-60" centered inviteFriend={inviteFriend} />
                    </div>

                    <div className="hidden xl:flex flex-col sticky top-20">
                        {actionButtons}
                        {mode === 'pvp' && pvpWinner && !pvpIsHost &&
                            <div className="text-pixel-sm text-ink-muted mt-2">
                                Waiting for host to start rematch...
                            </div>
                        }
                        {isPracticeRace && <PracticeProgress variant="panel" />}

                        {/* The whole panel, not just the bars — a hidden bar must
                            not leave an empty titled box behind. */}
                        {mode === 'pvp' && pvpStarted && showProgressBar &&
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

                        {/* Gated, not just emptied: PVP has no score table, and
                            the region announced "Player scores" around a box
                            holding nothing once the HUD left it. */}
                        {mode !== 'pvp' &&
                            <div className="overflow-x-auto mt-6" role="region" aria-label="Player scores">
                                <ScoreTable />
                            </div>
                        }
                    </div>
                </div>
            </div>

            {/* Mounted ONCE, like the players dialog: RoomPanel renders in
                both layout clusters, so the button is duplicated and the
                dialog must not be. */}
            <InviteFriendDialog inviteFriend={inviteFriend} />

            <Dialog
                id={DIALOGS.players}
                title="Players Online!"
                actions={<DialogClose aria-label="Close players dialog">Close</DialogClose>}>
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
