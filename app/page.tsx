"use client"
import { useEffect, useState } from "react";
import io from 'socket.io-client';
import { useMinesweeperStore } from './store';
import Landing from "@/components/Landing";
import Grid from "@/components/Grid";

const serverURL = process.env.NODE_ENV === "development"
  ? "http://localhost:3001" // Development URL
  : "https://minesweeper-co-op.onrender.com/"; // Production URL


// const socket = io('http://localhost:3001');
const socket = io(serverURL);

export default function Home() {

    const [ gameOverName, setGameOverName ] = useState("");
    const { name, room, playerJoined, numRows, numCols, numMines, setBoard,
        setGameOver, setGameWon, setRoom, setPlayerJoined,
        setDimensions, setPlayerNamesInRoom } = useMinesweeperStore();

    const createRoom = () => {
        if (!room) return;
        socket.emit("createRoom", { room, numRows, numCols, numMines, name })
    }

    // Join a room
    const joinRoom = () => {
        if (!room) return;

        socket.emit('joinRoom', { room, name });
    };

    useEffect(() => {
        // Listen for board updates

        socket.on('boardUpdate', (updatedBoard, rows, cols, mines) => {
            setDimensions(rows, cols, mines, "Medium");
            setBoard(updatedBoard);
        });

        socket.on("playerNamesUpdate", (updatedNames) => {
            setPlayerNamesInRoom(updatedNames);
        })

        socket.on("gameWon", () => {
            console.log("THE GAME IS WON");
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
        setGameWon(false);
        setGameOver(false);
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

            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-game-over">
                <form method="dialog">
                    <p className="title">You lost.</p>
                    <p>{gameOverName} hit a bomb!</p>
                    <menu className="dialog-menu">
                        <button className="nes-btn is-error text-xs">Cancel</button>
                    </menu>
                </form>
            </dialog>
        </>
    );
};