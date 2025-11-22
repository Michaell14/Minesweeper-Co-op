"use client"
import { useEffect, useState, useCallback } from "react";
import React from "react";
import { Cell, useMinesweeperStore } from './store';
import Landing from "@/components/Landing";
import Grid from "@/components/Grid";
import { shootConfetti } from "@/lib/confetti";
import { initSocket } from "@/lib/initSocket";
import { Socket } from "socket.io-client";
import { throttle, generateColorFromId } from "@/lib/throttle";

/**
 * Home Component
 * Main application component that manages the Minesweeper Co-op game.
 * Handles socket connections, room management, and game state.
 */
export default function Home() {
    // ============================================================================
    // STATE & STORE
    // ============================================================================

    const [socket, setSocket] = useState<Socket | null>(null);

    // Zustand store - contains all game state
    const {
        name,           // Player's display name
        room,           // Current room code
        playerJoined,   // Whether player has joined a room
        numRows,        // Board height (from difficulty settings)
        numCols,        // Board width (from difficulty settings)
        numMines,       // Number of mines (from difficulty settings)
        gameOverName,   // Name of player who hit a mine
        setBoard,       // Update entire board state
        setGameOver,    // Set game over state
        setGameWon,     // Set game won state
        setRoom,        // Set current room code
        setPlayerJoined,// Set player joined status
        setName,        // Set player name
        setDifficulty,  // Set difficulty level
        setDimensions,  // Set board dimensions (rows, cols, mines)
        setPlayerStatsInRoom, // Update player stats/scores
        setCell,        // Update individual cell state
        setGameOverName, // Set name of player who caused game over
        updatePlayerHover, // Update player hover state
        removePlayerHover, // Remove player hover
        clearAllHovers // Clear all hovers
    } = useMinesweeperStore();

    // ============================================================================
    // SOCKET INITIALIZATION
    // ============================================================================

    /**
     * Initialize socket connection on component mount
     * Cleanup: Disconnect socket when component unmounts
     */
    useEffect(() => {
        const newSocket = initSocket();
        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        }
    }, []);

    // ============================================================================
    // ROOM MANAGEMENT
    // ============================================================================

    /**
     * Leave the current room and reset all game state
     * Resets to Medium difficulty (16x16, 40 mines)
     */
    const leaveRoom = useCallback(() => {
        if (!socket) return;

        // Clear hover before leaving
        socket.emit('cellHover', { room, row: -1, col: -1 });
        
        socket.emit("playerLeave");
        setPlayerJoined(false);
        setBoard([]);
        setGameWon(false);
        setGameOver(false);
        setName("");
        setDimensions(16, 16, 40); // Default: Medium difficulty
        setDifficulty("Medium");
        clearAllHovers(); // Clear all hover states
    }, [socket, room, setPlayerJoined, setBoard, setGameWon, setGameOver, setName, setDimensions, setDifficulty, clearAllHovers]);

    // ============================================================================
    // SOCKET EVENT HANDLERS
    // ============================================================================

    /**
     * Set up all socket event listeners for real-time multiplayer communication
     * Handles: board updates, game state changes, room events, errors
     */
    useEffect(() => {
        if (!socket) return;

        socket.connect();

        // --- Game State Events ---

        /**
         * Receive full board update from server
         * Triggered when: joining room, board reset, game start
         */
        socket.on('boardUpdate', (updatedBoard: Cell[][]) => {
            setDifficulty("Medium");
            setBoard(updatedBoard);
        });

        /**
         * Receive partial cell updates (optimized for performance)
         * Triggered when: cells are opened, flagged, or chording occurs
         */
        socket.on("updateCells", (toUpdate: { row: number, col: number, isMine: boolean, isOpen: boolean, isFlagged: boolean, nearbyMines: number }[]) => {
            toUpdate.forEach((cell) => {
                setCell(cell.row, cell.col, {
                    isMine: cell.isMine,
                    isOpen: cell.isOpen,
                    isFlagged: cell.isFlagged,
                    nearbyMines: cell.nearbyMines,
                });
            });
        });

        /**
         * Update player statistics (scores) in current room
         */
        socket.on("playerStatsUpdate", (updatedStats) => {
            setPlayerStatsInRoom(updatedStats);
        });

        // --- Win/Loss Events ---

        /**
         * Game won - all non-mine cells revealed
         */
        socket.on("gameWon", () => {
            shootConfetti();
            setGameWon(true);
        });

        /**
         * Game over - someone hit a mine
         */
        socket.on("gameOver", (newName) => {
            setGameOver(true);
            setGameOverName(newName);
            (document.getElementById('dialog-game-over') as HTMLDialogElement)?.showModal();
        });

        /**
         * Reset game state for all players in room
         */
        socket.on("resetEveryone", () => {
            setGameOver(false);
            setGameWon(false);
            clearAllHovers(); // Clear hovers on reset
        });

        // --- Room Management Events ---

        /**
         * Successfully joined a room
         */
        socket.on("joinRoomSuccess", (newRoom) => {
            setRoom(newRoom);
            setPlayerJoined(true);
        });

        // --- Error Events ---

        /**
         * Error: Tried to join a room that doesn't exist
         */
        socket.on("joinRoomError", () => {
            (document.getElementById('dialog-join-room-error') as HTMLDialogElement)?.showModal();
        });

        /**
         * Error: Tried to create a room that already exists
         */
        socket.on("createRoomError", () => {
            (document.getElementById('dialog-create-room-error') as HTMLDialogElement)?.showModal();
        });

        /**
         * Error: Room was deleted or became invalid while playing
         */
        socket.on("roomDoesNotExistError", () => {
            leaveRoom();
            (document.getElementById('dialog-room-does-not-exist-error') as HTMLDialogElement)?.showModal();
        });

        // --- Special Events ---

        /**
         * Receive confetti trigger from another player
         */
        socket.on("receiveConfetti", () => {
            shootConfetti();
        });

        // --- Hover Events ---

        /**
         * Receive hover updates from other players
         */
        socket.on('playerHoverUpdate', ({ id, row, col, name }) => {
            console.log('Received hover update:', { id, row, col, name });
            const color = generateColorFromId(id);
            if (row === -1 && col === -1) {
                // Player cleared their hover
                removePlayerHover(id);
            } else {
                updatePlayerHover(id, row, col, name, color);
            }
        });

        /**
         * Remove hover when player leaves
         */
        socket.on('playerLeft', (socketId) => {
            removePlayerHover(socketId);
        });

        // Cleanup: Remove all event listeners when socket changes or component unmounts
        return () => {
            socket.off('boardUpdate');
            socket.off("updateCells");
            socket.off("playerStatsUpdate");
            socket.off("gameWon");
            socket.off("gameOver");
            socket.off("resetEveryone");
            socket.off("joinRoomSuccess");
            socket.off("joinRoomError");
            socket.off("createRoomError");
            socket.off("roomDoesNotExistError");
            socket.off("receiveConfetti");
            socket.off('playerHoverUpdate');
            socket.off('playerLeft');
        };
    }, [socket, leaveRoom, setBoard, setCell, setDifficulty, setGameOver, setGameOverName, setGameWon, setPlayerJoined, setPlayerStatsInRoom, setRoom, updatePlayerHover, removePlayerHover]);

    // ============================================================================
    // SOCKET EMIT FUNCTIONS (Client -> Server)
    // ============================================================================

    /**
     * Create a new room with specified difficulty settings
     * Server validates room doesn't exist before creating
     */
    const createRoom = () => {
        if (!room || !socket) return;
        socket.emit("createRoom", { room, numRows, numCols, numMines, name });
    };

    /**
     * Join an existing room
     * Server validates room exists before allowing join
     */
    const joinRoom = () => {
        if (!room || !socket) return;
        socket.emit('joinRoom', { room, name });
    };

    /**
     * Open a cell at the specified coordinates
     * If cell is mine: game over
     * If cell is empty: reveal adjacent cells recursively
     */
    const openCell = (row: number, col: number) => {
        if (!playerJoined || !socket) return;
        socket.emit('openCell', { room, row, col });
    };

    /**
     * Chord/Middle-click a cell
     * If an opened cell's number equals adjacent flags, opens all unflagged neighbors
     * Used for fast gameplay when you're confident about mine locations
     * Memoized to prevent infinite loops in Grid component's useEffect
     */
    const chordCell = useCallback((row: number, col: number) => {
        if (!playerJoined || !socket) return;
        socket.emit('chordCell', { room, row, col });
    }, [playerJoined, socket, room]);

    /**
     * Toggle flag on a cell (right-click or flag mode tap)
     * Cycles: unmarked -> flagged -> unmarked
     */
    const toggleFlag = (row: number, col: number) => {
        if (!playerJoined || !socket) return;
        socket.emit('toggleFlag', { room, row, col });
    };

    /**
     * Reset the game board
     * Generates new mine placement and resets all cells
     */
    const resetGame = () => {
        if (!socket) return;
        socket.emit('resetGame', { room });
    };

    /**
     * Trigger confetti animation for all players in room
     * Fun way to celebrate wins or other achievements
     */
    const emitConfetti = () => {
        if (!socket) return;
        socket.emit('emitConfetti', { room });
    };

    /**
     * Emit cell hover event (throttled)
     * Sends row=-1, col=-1 when leaving cell
     */
    const emitCellHover = useCallback((row: number, col: number) => {
        if (!socket || !room || !playerJoined) return;
        console.log('Emitting hover:', { room, row, col });
        socket.emit('cellHover', { room, row, col });
    }, [socket, room, playerJoined]);

    // Apply throttle using useMemo to avoid recreating throttled function
    const throttledEmitCellHover = React.useMemo(
        () => throttle(emitCellHover, 100),
        [emitCellHover]
    );

    /**
     * Clear hover when mouse leaves the entire game board
     */
    const handleBoardLeave = useCallback(() => {
        if (!socket || !room || !playerJoined) return;
        socket.emit('cellHover', { room, row: -1, col: -1 });
    }, [socket, room, playerJoined]);

    // ============================================================================
    // RENDER
    // ============================================================================

    return (
        <>
            {/* Conditional rendering: show Landing page or Game Grid */}
            {!playerJoined ? (
                <Landing createRoom={createRoom} joinRoom={joinRoom} />
            ) : (
                <Grid
                    leaveRoom={leaveRoom}
                    resetGame={resetGame}
                    toggleFlag={toggleFlag}
                    openCell={openCell}
                    chordCell={chordCell}
                    emitConfetti={emitConfetti}
                    emitCellHover={throttledEmitCellHover}
                    handleBoardLeave={handleBoardLeave}
                />
            )}

            {/* ============================================================================ */}
            {/* ERROR & NOTIFICATION DIALOGS */}
            {/* ============================================================================ */}

            {/* Game Over Dialog - Shows when someone hits a mine */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-game-over"
                role="alertdialog"
                aria-labelledby="game-over-title">
                <form method="dialog">
                    <p id="game-over-title" className="title">Uh Oh!</p>
                    <p><span className="underline decoration-2">{gameOverName}</span> hit a bomb.</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-error text-xs" aria-label="Close game over dialog">Cancel</button>
                    </menu>
                </form>
            </dialog>

            {/* Create Room Error - Room already exists */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-create-room-error"
                role="alertdialog"
                aria-labelledby="create-room-error-title">
                <form method="dialog">
                    <p id="create-room-error-title">This room already exists.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn" aria-label="Close error dialog">Cancel</button>
                    </div>
                </form>
            </dialog>

            {/* Join Room Error - Room doesn't exist */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-join-room-error"
                role="alertdialog"
                aria-labelledby="join-room-error-title">
                <form method="dialog">
                    <p id="join-room-error-title">This room does not exist.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn" aria-label="Close error dialog">Cancel</button>
                    </div>
                </form>
            </dialog>

            {/* Room Deleted Error - Room became invalid during gameplay */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-room-does-not-exist-error"
                role="alertdialog"
                aria-labelledby="room-error-title">
                <form method="dialog">
                    <p id="room-error-title">There was an error joining the room.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn" onClick={() => setPlayerJoined(false)} aria-label="Close error dialog">Cancel</button>
                    </div>
                </form>
            </dialog>
        </>
    );
};