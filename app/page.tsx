"use client"
import { useState, useEffect } from "react";
import styles from "./Home.module.css";
import io from 'socket.io-client';
import { useMinesweeperStore } from './store';
import { SimpleGrid, Container, Center } from "@chakra-ui/react";

// const socket = io('http://localhost:3001');
const socket = io('https://minesweeper-co-op.onrender.com/');
export default function Home() {

  const { board, gameOver, gameWon, room, playerJoined,
    setBoard, setGameOver, setGameWon, setRoom, setPlayerJoined } = useMinesweeperStore();
  //const [board, setBoard] = useState<any[][]>([]);
  //const [gameWon, setGameWon] = useState(false);
  //const [room, setRoom] = useState<string>('');
  //const [joined, setJoined] = useState(false);

  // Join a room
  const joinRoom = () => {
    if (room) {
      socket.emit('joinRoom', { room });
      setPlayerJoined(true);
    }
  };

  useEffect(() => {
    // Listen for board updates
    socket.on('boardUpdate', (updatedBoard) => {
      console.log("board updated");
      setBoard(updatedBoard);
    });

    socket.on("gameWon", () => {
      console.log("THE GAME IS WON");
      setGameWon(true);
    })

    socket.on("gameOver", () => {
      setGameOver(true);
      console.log("GAME IS OVER");
    })

    // Clean up socket listeners
    return () => {
      socket.off('boardUpdate');
      socket.off("gameWon");
    };
  }, []);

  useEffect(() => {
    console.log(board);
  }, [board])


  const openCell = (row: number, col: number) => {
    if (!playerJoined) return;
    socket.emit('openCell', { room, row, col });
  };

  const toggleFlag = (row: number, col: number) => {
    if (!playerJoined) return;
    socket.emit('toggleFlag', { room, row, col });
  };

  const renderCell = (cell: any, row: number, col: number) => {
    if (cell.isOpen) {
      if (cell.isMine) return <div key={col} className={`${styles.cell} ${styles.mine}`}>💣</div>;
      return <div key={col} className={`${styles.cell} ${styles.open}`}>{cell.nearbyMines > 0 ? cell.nearbyMines : ''}</div>;
    }

    if (cell.isFlagged) {
      return (
        <div
          key={col}
          className={`${styles.cell} ${styles.flagged}`}
          onContextMenu={(e) => {
            e.preventDefault();
            toggleFlag(row, col);
          }}>🚩</div>
      )
    };
    return (
      <div
        key={col}
        className={`${styles.cell} ${styles.closed}`}
        onClick={() => openCell(row, col)}
        onContextMenu={(e) => {
          e.preventDefault();
          toggleFlag(row, col);
        }}
      >
        &nbsp;
      </div>
    );
  };


  return (
    <Container maxW={"3xl"}>

      {!playerJoined ? (
        <Center>
          <div className="mt-40">
            <p className="text-5xl font-bold">Minesweeper Co-op</p>
            <p className="mt-10 text-xl">Join Room:</p>
            <div className="flex gap-5 w-full">
              <input className="w-full" type="text" value={room} onChange={(e) => { setRoom(e.target.value) }} placeholder="Enter room name" />
              <div className="border-solid border-2 border-black w-fit rounded-md p-1" onClick={joinRoom}>Join</div>
            </div>
            <p className="mt-10">Rules</p>
            <p>1) Create a room code (Can be anything you want)</p>
            <p>2) Tell your friends the code</p>
            <p>3) Play together!</p>
          </div>
        </Center>
      ) : (
        <>
          <p>HELO WORLD</p>
          <SimpleGrid columns={8}>
            {board.map((row, rowIndex) => (
              <div key={rowIndex} className="row">
                {row.map((cell, colIndex) => renderCell(cell, rowIndex, colIndex))}
              </div>
            ))}
          </SimpleGrid>
        </>
      )}

    </Container>
  );
};
