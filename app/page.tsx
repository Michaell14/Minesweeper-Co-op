"use client"
import { useEffect } from "react";
import io from 'socket.io-client';
import { useMinesweeperStore } from './store';
import Landing from "@/components/Landing";
import Grid from "@/components/Grid";

const socket = io('http://localhost:3001');
// const socket = io('https://minesweeper-co-op.onrender.com/');

export default function Home() {

    const { room, playerJoined, numRows, numCols, numMines, setBoard,
        setGameOver, setGameWon, setRoom, setPlayerJoined,
        setDimensions } = useMinesweeperStore();

    const createRoom = (newRoom: string) => {
        if (!newRoom) return;

        socket.emit("createRoom", { newRoom, numRows, numCols, numMines })
    }

    // Join a room
    const joinRoom = (newRoom: string) => {
        if (!newRoom) return;

        socket.emit('joinRoom', { newRoom });
    };

    useEffect(() => {
        // Listen for board updates

        socket.on('boardUpdate', (updatedBoard, rows, cols, mines) => {
            setDimensions(rows, cols, mines, "Medium");
            setBoard(updatedBoard);
        });

        socket.on("gameWon", () => {
            console.log("THE GAME IS WON");
            setGameWon(true);
        })

        socket.on("gameOver", () => {
            setGameOver(true);
            console.log("GAME IS OVER");
            (document.getElementById('dialog-default') as HTMLDialogElement)?.showModal();
        })

        socket.on("resetEveryone", () => {
            setGameOver(false);
            setGameWon(false);
        })

        socket.on("joinRoomSuccess", (newRoom) => {
            setRoom(newRoom);
            setPlayerJoined(true);
        })

        socket.on("joinRoomError", (newRoom) => {
            console.log("This room does not exist yet");
        })

        socket.on("createRoomError", (newRoom) => {
            console.log("This room already exists");
        })

        // Clean up socket listeners
        return () => {
            socket.off('boardUpdate');
            socket.off("gameWon");
            socket.off("gameOver");
            socket.off("resetGame");
            socket.off("joinRoomSuccess");
            socket.off("joinRoomError");
            socket.off("createRoomError");
        };
    }, []);

    const openCell = (row: number, col: number) => {
        if (!playerJoined) return;
        socket.emit('openCell', { room, row, col });
    };

    const toggleFlag = (row: number, col: number) => {
        if (!playerJoined) return;
        socket.emit('toggleFlag', { room, row, col });
    };

    const resetGame = () => {
        socket.emit('resetGame', { room })
    }

    const leaveRoom = () => {
        socket.emit("playerLeave");
        setPlayerJoined(false);
        setBoard([]);
        setDimensions(13, 15, 40, "Medium");
    }

    return (
        <>
            {!playerJoined ? (
                <Landing createRoom={createRoom} joinRoom={joinRoom} />
            ) : (
                <>
                    <Grid leaveRoom={leaveRoom} resetGame={resetGame} toggleFlag={toggleFlag} openCell={openCell} />

                </>
            )}

            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-default">
                <form method="dialog">
                    <p className="title">You lost.</p>
                    <p>Someone hit a bomb!</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-error text-xs">Cancel</button>
                    </menu>
                </form>
            </dialog>
        </>
    );
};