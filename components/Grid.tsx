/**
 * Grid Component
 * Main game board display and interaction handler
 * Renders the Minesweeper grid, controls, and player stats
 */
import React, { useEffect } from 'react';
import { Center, Container, HStack, VStack, Box } from "@chakra-ui/react";
import { useMinesweeperStore } from '@/app/store';
import Cell from "@/components/Cell";
import { Switch } from "@/components/ui/switch";
import styles from "./Home.module.css";

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
}

const Grid = React.memo(({ leaveRoom, resetGame, toggleFlag, openCell, chordCell, emitConfetti, emitCellHover, handleBoardLeave }: GridParams) => {
    // ============================================================================
    // STATE
    // ============================================================================

    const {
        r,                  // Current mouse row coordinate
        c,                  // Current mouse column coordinate
        leftClick,          // Left mouse button state
        rightClick,         // Right mouse button state
        isChecked,          // Mobile mode: click (true) vs flag (false)
        room,               // Current room code
        playerStatsInRoom,  // All players' scores
        board,              // Game board state
        gameOver,           // Game over flag
        gameWon,            // Game won flag
        numMines,           // Total number of mines
        setIsChecked,       // Toggle mobile mode
        setBothPressed      // Set both-buttons-pressed state
    } = useMinesweeperStore();

    // Calculate remaining flags (total mines - flags placed)
    // Optimization: Use useMemo to avoid recalculating on every render
    const remainingFlags = React.useMemo(() => {
        let flagCount = 0;
        for (let i = 0; i < board.length; i++) {
            for (let j = 0; j < board[i].length; j++) {
                if (board[i][j].isFlagged) flagCount++;
            }
        }
        return numMines - flagCount;
    }, [board, numMines]);

    // ============================================================================
    // DIALOG HELPERS
    // ============================================================================

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


    return (
        <>
            <Container minH={"94vh"} pb={{ base: 6, xl: 16 }} maxW={"1350px"} pt={{ base: 10, xl: 20 }}>

                <h1 className="text-center font-bold text-2xl md:text-4xl">Minesweeper Co-Op</h1>

                {/* ARIA live region for game status announcements */}
                <div aria-live="assertive" aria-atomic="true" className="sr-only">
                    {gameWon && "Game won! All mines have been found."}
                    {gameOver && "Game over! A mine was triggered."}
                </div>

                <Center hideBelow={"xl"} justifyContent={"space-around"} alignItems={"flex-start"} mt={16} gap={20}>
                    <div className="flex flex-col sticky top-20">
                        <button
                            type="button"
                            className="nes-btn is-warning text-xs"
                            onClick={leaveRoom}
                            aria-label="Leave room and return to home page">
                            Return to Home
                        </button>
                        <div className="bg-slate-100 nes-container with-title max-w-60 mt-6" role="region" aria-label="Room information">
                            <p className="title text-xs">Room:</p>
                            <p className="text-sm" aria-label={`Room code: ${room}`}> {room}</p>
                        </div>
                    </div>
                    <div>
                        <Center>
                            {gameWon &&
                                <div className="nes-badge pb-12" role="status" aria-label="Game won">
                                    <span className="is-success" onClick={emitConfetti}>GAME WON!</span>
                                </div>
                            }
                            {gameOver &&
                                <div className="nes-badge pb-12" role="status" aria-label="Game lost">
                                    <span className="is-error">GAME LOST!</span>
                                </div>
                            }
                        </Center>
                        <div
                            className={styles.gameBoard}
                            onMouseLeave={handleBoardLeave}
                            role="grid"
                            aria-label={`Minesweeper game board, ${board.length} rows by ${board[0]?.length || 0} columns`}>
                            {board.map((row, rowIndex: number) => (
                                <div key={rowIndex} className={styles.gameRow} role="row">
                                    {row.map((cell, colIndex: number) => (
                                        <Cell
                                            key={colIndex}
                                            cell={cell}
                                            row={rowIndex}
                                            col={colIndex}
                                            toggleFlag={toggleFlag}
                                            openCell={openCell}
                                            chordCell={chordCell}
                                            emitCellHover={emitCellHover} />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col sticky top-20">
                        <button
                            type="button"
                            className="nes-btn text-xs is-primary"
                            onClick={resetGame}
                            aria-label="Reset game board with new mine placement">
                            Reset Board
                        </button>

                        <div className="nes-table-responsive mt-6" role="region" aria-label="Player scores">
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
                                            <td className="text-sm max-w-40">{item.name}</td>
                                            <td className="text-sm">{item.score}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Flag counter */}
                            <div className="bg-slate-100 nes-container is-centered mt-4" role="status" aria-label={`${remainingFlags} flags remaining`}>
                                <p className="text-sm m-0">
                                    🚩 <strong>{remainingFlags}</strong>
                                </p>
                            </div>
                        </div>
                    </div>
                </Center>

                <Center hideFrom={"xl"} mt={10}>
                    <VStack>
                        <HStack gap={8}>
                            <button
                                type="button"
                                className="nes-btn is-warning text-xs"
                                onClick={leaveRoom}
                                aria-label="Leave room and return to home page">
                                Return to Home
                            </button>
                            <button
                                type="button"
                                className="nes-btn text-xs is-primary"
                                onClick={resetGame}
                                aria-label="Reset game board with new mine placement">
                                Reset Board
                            </button>
                        </HStack>

                        <HStack gap={8}>
                            <div className="my-6 bg-slate-100 nes-container is-centered with-title max-w-60" role="region" aria-label="Room information">
                                <p className="title text-xs">Room:</p>
                                <p className="text-sm" aria-label={`Room code: ${room}`}> {room}</p>
                            </div>
                            <button
                                className="nes-icon trophy is-medium"
                                onClick={openPlayersDialog}
                                aria-label="View player scores"
                                style={{ border: 'none', background: 'none', cursor: 'pointer' }}
                            />
                        </HStack>
                        <Box hideFrom={"sm"}>
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
                        <Center>
                            {gameWon &&
                                <div className="nes-badge pb-12" role="status" aria-label="Game won">
                                    <span className="is-success" onClick={emitConfetti}>GAME WON!</span>
                                </div>
                            }
                            {gameOver &&
                                <div className="nes-badge pb-12" role="status" aria-label="Game lost">
                                    <span className="is-error">GAME LOST!</span>
                                </div>
                            }
                        </Center>
                        <div
                            className={styles.gameBoard}
                            onMouseLeave={handleBoardLeave}
                            role="grid"
                            aria-label={`Minesweeper game board, ${board.length} rows by ${board[0]?.length || 0} columns`}>
                            {board.map((row, rowIndex: number) => (
                                <div key={rowIndex} className={styles.gameRow} role="row">
                                    {row.map((cell, colIndex: number) => (
                                        <Cell
                                            key={colIndex}
                                            cell={cell}
                                            row={rowIndex}
                                            col={colIndex}
                                            toggleFlag={toggleFlag}
                                            openCell={openCell}
                                            chordCell={chordCell}
                                            emitCellHover={emitCellHover} />
                                    ))}
                                </div>
                            ))}
                        </div>
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
                        <table className="nes-table is-bordered is-centered" aria-label="Player scores">
                            <thead>
                                <tr>
                                    <th scope="col">Player</th>
                                    <th scope="col">Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                {playerStatsInRoom.map((item, index) => (
                                    <tr key={index}>
                                        <td className="text-sm max-w-60">{item.name}</td>
                                        <td className="text-sm">{item.score}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        
                        {/* Flag counter */}
                        <div className="bg-slate-100 nes-container is-centered mt-4 py-1" role="status" aria-label={`${remainingFlags} flags remaining`}>
                            <p className="text-sm m-0">
                                🚩 <strong>{remainingFlags}</strong> left
                            </p>
                        </div>
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