"use client"
import { useEffect, useState } from "react";
import { Cell, useMinesweeperStore } from './store';
import Landing from "@/components/Landing";
import Grid from "@/components/Grid";
import { shootConfetti } from "@/lib/confetti";
import { initSocket } from "@/lib/initSocket";
import { Socket } from "socket.io-client";

export default function Home() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const { name, room, playerJoined, numRows, numCols, numMines, gameOverName, setBoard,
        setGameOver, setGameWon, setRoom, setPlayerJoined, setName, setDifficulty,
        setDimensions, setPlayerStatsInRoom, setCell, setGameOverName } = useMinesweeperStore();
    
    useEffect(() => {
        const newSocket = initSocket();
        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        }
    }, []);

    // Set up socket event listeners
    useEffect(() => {
        if (!socket) return;

        socket.connect();
       
        // Listen for board updates
        socket.on('boardUpdate', (updatedBoard: Cell[][]) => {
            setDifficulty("Medium");
            setBoard(updatedBoard);
        });

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
        socket.on("playerStatsUpdate", (updatedStats) => {
            setPlayerStatsInRoom(updatedStats);
        })

        socket.on("gameWon", () => {
            shootConfetti();
            setGameWon(true);
        })

        socket.on("gameOver", (newName) => {
            setGameOver(true);
            setGameOverName(newName);
            (document.getElementById('dialog-game-over') as HTMLDialogElement)?.showModal();
        })

        socket.on("resetEveryone", () => {
            setGameOver(false);
            setGameWon(false);
        })

        // Updates player's room when joined successfully
        socket.on("joinRoomSuccess", (newRoom) => {
            setRoom(newRoom);
            setPlayerJoined(true);
        })

        // Shows Join Room Error Dialog
        socket.on("joinRoomError", () => {
            (document.getElementById('dialog-join-room-error') as HTMLDialogElement)?.showModal();
        })

        // Shows Create Room Error Dialog
        socket.on("createRoomError", () => {
            (document.getElementById('dialog-create-room-error') as HTMLDialogElement)?.showModal();
        })

        socket.on("roomDoesNotExistError", () => {
            leaveRoom();
            (document.getElementById('dialog-room-does-not-exist-error') as HTMLDialogElement)?.showModal();
        })

        // CONFETTIIIIIIIIIIII
        socket.on("receiveConfetti", () => {
            shootConfetti();
        })

        // Clean up socket listeners
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
        };
    }, [socket]);

    const createRoom = () => {
        if (!room || !socket) return;
        socket.emit("createRoom", { room, numRows, numCols, numMines, name });
    }

    // Join a room
    const joinRoom = () => {
        if (!room || !socket) return;
        socket.emit('joinRoom', { room, name });
    };

    const openCell = (row: number, col: number) => {
        if (!playerJoined || !socket) return;
        socket.emit('openCell', { room, row, col });
    };

    const chordCell = (row: number, col: number) => {
        if (!playerJoined || !socket) return;
        socket.emit('chordCell', { room, row, col });
    }

    const toggleFlag = (row: number, col: number) => {
        if (!playerJoined || !socket) return;
        socket.emit('toggleFlag', { room, row, col });
    };

    const resetGame = () => {
        if (!socket) return;
        socket.emit('resetGame', { room })
    }

    const emitConfetti = () => {
        if (!socket) return;
        socket.emit('emitConfetti', { room });
    }

    const leaveRoom = () => {
        if (!socket) return;
        socket.emit("playerLeave");
        setPlayerJoined(false);
        setBoard([]);
        setGameWon(false);
        setGameOver(false);
        setName("");
        setDimensions(15, 13, 40); // rows=15, cols=13 (default Medium)
        setDifficulty("Medium")
    }

    return (
        <> 
            {!playerJoined ? (
                <Landing createRoom={createRoom} joinRoom={joinRoom} />
            ) : (
                <>
                    <Grid leaveRoom={leaveRoom} resetGame={resetGame}
                        toggleFlag={toggleFlag} openCell={openCell}
                        chordCell={chordCell} emitConfetti={emitConfetti} />

                </>
            )}

            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-game-over">
                <form method="dialog">
                    <p className="title">Uh Oh!</p>
                    <p><span className="underline decoration-2">{gameOverName}</span> hit a bomb.</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-error text-xs">Cancel</button>
                    </menu>
                </form>
            </dialog>
            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-create-room-error">
                <form method="dialog">
                    <p>This room already exists.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn">Cancel</button>
                    </div>
                </form>
            </dialog>

            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-join-room-error">
                <form method="dialog">
                    <p>This room does not exist.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn">Cancel</button>
                    </div>
                </form>
            </dialog>
            
            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-room-does-not-exist-error">
                <form method="dialog">
                    <p>There was an error joining the room.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn" onClick={() => setPlayerJoined(false)}>Cancel</button>
                    </div>
                </form>
            </dialog>
        </>
    );
};