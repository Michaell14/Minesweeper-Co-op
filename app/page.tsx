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
        mode,           // Game mode (co-op or pvp)
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
        clearAllHovers, // Clear all hovers
        // PVP state
        setPvpStarted,
        setPvpPlayerIndex,
        setPvpOpponentName,
        setPvpOpponentStatus,
        setPvpWinner,
        setPvpRoomReady,
        setPvpIsHost,
        setPvpOpponentProgress,
        setPvpTotalSafeCells,
        resetPvpState,
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
     * Resets to Medium difficulty (16x16, 40 mines) and co-op mode
     */
    const leaveRoom = useCallback(() => {
        if (!socket) return;

        // Clear hover before leaving
        socket.emit('cellHover', { room, row: -1, col: -1 });

        socket.emit("playerLeave");
        setPlayerJoined(false);
        setBoard([]);
        setName("");
        setDimensions(16, 16, 40); // Default: Medium difficulty
        setDifficulty("Medium");
        clearAllHovers(); // Clear all hover states
        resetPvpState(); // Reset all PVP state (also resets gameOver/gameWon)
        useMinesweeperStore.getState().setMode('co-op'); // Reset to default mode
    }, [socket, room, setPlayerJoined, setBoard, setName, setDimensions, setDifficulty, clearAllHovers, resetPvpState]);

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
        socket.on("joinRoomSuccess", (data) => {
            // Handle both old format (string) and new format (object)
            if (typeof data === 'string') {
                setRoom(data);
            } else {
                setRoom(data.room);
                if (data.mode) {
                    useMinesweeperStore.getState().setMode(data.mode);
                }
                if (data.isHost !== undefined) {
                    setPvpIsHost(data.isHost);
                }
                // Sync difficulty config for joining players (fixes flag counter bug)
                if (data.numRows && data.numCols && data.numMines) {
                    setDimensions(data.numRows, data.numCols, data.numMines);
                }
            }
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

        // --- PVP Events ---

        /**
         * PVP: Room is full (max 2 players)
         */
        socket.on('pvpRoomFull', () => {
            (document.getElementById('dialog-pvp-room-full') as HTMLDialogElement)?.showModal();
        });

        /**
         * PVP: Second player joined, room ready to start
         */
        socket.on('pvpRoomReady', (data: { opponentName: string, isHost: boolean }) => {
            setPvpRoomReady(true);
            if (data && data.opponentName) {
                setPvpOpponentName(data.opponentName);
            }
            if (data && data.isHost !== undefined) {
                setPvpIsHost(data.isHost);
            }
        });

        /**
         * PVP: Game has started
         */
        socket.on('pvpGameStarted', (data: { totalSafeCells?: number }) => {
            setPvpStarted(true);
            setPvpOpponentStatus('playing');
            if (data && data.totalSafeCells) {
                setPvpTotalSafeCells(data.totalSafeCells);
            }
            setPvpOpponentProgress(0);
        });

        /**
         * PVP: Receive board update for this player
         */
        socket.on('pvpBoardUpdate', ({ board, playerIndex, opponentName, opponentProgress, totalSafeCells }: {
            board: Cell[][],
            playerIndex: number,
            opponentName?: string,
            opponentProgress?: number,
            totalSafeCells?: number
        }) => {
            setBoard(board);
            if (playerIndex !== undefined) {
                setPvpPlayerIndex(playerIndex);
            }
            if (opponentName) {
                setPvpOpponentName(opponentName);
            }
            if (opponentProgress !== undefined) {
                setPvpOpponentProgress(opponentProgress);
            }
            if (totalSafeCells !== undefined) {
                setPvpTotalSafeCells(totalSafeCells);
            }
        });

        /**
         * PVP: Receive cell updates for this player
         */
        socket.on('pvpUpdateCells', (toUpdate: { row: number, col: number, isMine: boolean, isOpen: boolean, isFlagged: boolean, nearbyMines: number }[]) => {
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
         * PVP: This player lost (hit a mine)
         */
        socket.on('pvpGameOver', () => {
            setGameOver(true);
            setPvpOpponentStatus('playing'); // Opponent might still be playing
            (document.getElementById('dialog-pvp-game-over') as HTMLDialogElement)?.showModal();
        });

        /**
         * PVP: Opponent hit a mine
         */
        socket.on('pvpOpponentFailed', () => {
            setPvpOpponentStatus('failed');
        });

        /**
         * PVP: Opponent reset their board
         */
        socket.on('pvpOpponentReset', () => {
            setPvpOpponentStatus('playing');
        });

        /**
         * PVP: Someone won
         */
        socket.on('pvpPlayerWon', ({ winnerSocket, winnerName }: { winnerSocket: string, winnerName: string }) => {
            setPvpWinner(winnerName);
            setPvpOpponentStatus('won');

            if (socket.id === winnerSocket) {
                // This player won
                shootConfetti();
                setGameWon(true);
                (document.getElementById('dialog-pvp-you-won') as HTMLDialogElement)?.showModal();
            } else {
                // Opponent won
                (document.getElementById('dialog-pvp-opponent-won') as HTMLDialogElement)?.showModal();
            }
        });

        /**
         * PVP: Receive opponent's progress update
         */
        socket.on('pvpOpponentProgress', ({ progress }: { progress: number }) => {
            setPvpOpponentProgress(progress);
        });

        /**
         * PVP: Opponent disconnected, you win!
         */
        socket.on('pvpOpponentDisconnected', ({ winnerName }: { winnerSocket: string, winnerName: string }) => {
            setPvpWinner(winnerName);
            setPvpOpponentStatus('disconnected');
            shootConfetti();
            setGameWon(true);
            (document.getElementById('dialog-pvp-opponent-disconnected') as HTMLDialogElement)?.showModal();
        });

        /**
         * PVP: Opponent left before game started - go back to waiting state
         */
        socket.on('pvpOpponentLeftBeforeStart', () => {
            setPvpRoomReady(false);
            setPvpOpponentName('');
        });

        /**
         * PVP: Host left, you are now the host
         */
        socket.on('pvpHostTransferred', () => {
            setPvpIsHost(true);
        });

        /**
         * PVP: Rematch started
         */
        socket.on('pvpRematchStarted', ({ totalSafeCells, isHost }: { totalSafeCells: number, isHost: boolean }) => {
            resetPvpState();
            setPvpStarted(true);
            setPvpOpponentStatus('playing');
            setPvpTotalSafeCells(totalSafeCells);
            setPvpOpponentProgress(0);
            setPvpIsHost(isHost); // Restore host status after reset
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
            socket.off('pvpRoomFull');
            socket.off('pvpRoomReady');
            socket.off('pvpGameStarted');
            socket.off('pvpBoardUpdate');
            socket.off('pvpUpdateCells');
            socket.off('pvpGameOver');
            socket.off('pvpOpponentFailed');
            socket.off('pvpOpponentReset');
            socket.off('pvpPlayerWon');
            socket.off('pvpOpponentProgress');
            socket.off('pvpOpponentDisconnected');
            socket.off('pvpOpponentLeftBeforeStart');
            socket.off('pvpHostTransferred');
            socket.off('pvpRematchStarted');
        };
    }, [socket, leaveRoom, setBoard, setCell, setDifficulty, setGameOver, setGameOverName, setGameWon, setPlayerJoined, setPlayerStatsInRoom, setRoom, updatePlayerHover, removePlayerHover, setPvpStarted, setPvpPlayerIndex, setPvpOpponentName, setPvpOpponentStatus, setPvpWinner, setPvpRoomReady, setPvpIsHost, setPvpOpponentProgress, setPvpTotalSafeCells, resetPvpState, clearAllHovers]);

    // ============================================================================
    // SOCKET EMIT FUNCTIONS (Client -> Server)
    // ============================================================================

    /**
     * Create a new room with specified difficulty settings
     * Server validates room doesn't exist before creating
     */
    const createRoom = () => {
        if (!room || !socket) return;
        socket.emit("createRoom", { room, numRows, numCols, numMines, name, mode });
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
     * PVP: Start the game (when 2 players ready)
     */
    const startPvpGame = () => {
        if (!socket) return;
        socket.emit('startPvpGame', { room });
    };

    /**
     * PVP: Reset only this player's board
     */
    const resetMyBoard = () => {
        if (!socket) return;
        socket.emit('resetMyBoard', { room });
        setGameOver(false);
    };

    /**
     * PVP: Request rematch (host only)
     */
    const pvpRematch = () => {
        if (!socket) return;
        socket.emit('pvpRematch', { room });
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
                    startPvpGame={startPvpGame}
                    resetMyBoard={resetMyBoard}
                    pvpRematch={pvpRematch}
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

            {/* ============================================================================ */}
            {/* PVP-SPECIFIC DIALOGS */}
            {/* ============================================================================ */}

            {/* PVP Room Full - Cannot join */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-pvp-room-full"
                role="alertdialog"
                aria-labelledby="pvp-room-full-title">
                <form method="dialog">
                    <p id="pvp-room-full-title" className="title">Room Full!</p>
                    <p>This PVP room already has 2 players.</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn" aria-label="Close dialog">OK</button>
                    </menu>
                </form>
            </dialog>

            {/* PVP Game Over - This player hit a mine */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-pvp-game-over"
                role="alertdialog"
                aria-labelledby="pvp-game-over-title">
                <form method="dialog">
                    <p id="pvp-game-over-title" className="title">Boom!</p>
                    <p>You hit a mine. Reset your board to try again!</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-error" aria-label="Close dialog">OK</button>
                    </menu>
                </form>
            </dialog>

            {/* PVP You Won */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-pvp-you-won"
                role="alertdialog"
                aria-labelledby="pvp-you-won-title">
                <form method="dialog">
                    <p id="pvp-you-won-title" className="title">Victory!</p>
                    <p>You completed your board first. You win!</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-success" aria-label="Close dialog">Awesome!</button>
                    </menu>
                </form>
            </dialog>

            {/* PVP Opponent Won */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-pvp-opponent-won"
                role="alertdialog"
                aria-labelledby="pvp-opponent-won-title">
                <form method="dialog">
                    <p id="pvp-opponent-won-title" className="title">Defeat</p>
                    <p>Your opponent completed their board first.</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn" aria-label="Close dialog">OK</button>
                    </menu>
                </form>
            </dialog>

            {/* PVP Opponent Disconnected */}
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id="dialog-pvp-opponent-disconnected"
                role="alertdialog"
                aria-labelledby="pvp-opponent-disconnected-title">
                <form method="dialog">
                    <p id="pvp-opponent-disconnected-title" className="title">Victory!</p>
                    <p>Your opponent disconnected. You win by default!</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-success" aria-label="Close dialog">Nice!</button>
                    </menu>
                </form>
            </dialog>
        </>
    );
};