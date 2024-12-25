"use client"
import { useEffect } from "react";
import styles from "./Home.module.css";
import io from 'socket.io-client';
import { useMinesweeperStore } from './store';
import { SimpleGrid, Container, Center, Button, HStack, Stack, Input } from "@chakra-ui/react";
import {
  RadioCardItem,
  RadioCardLabel,
  RadioCardRoot,
} from "@/components/ui/radio-card";
import { Field } from "@/components/ui/field"
import { useForm } from "react-hook-form"

interface FormValues {
  roomCode: string
}

const socket = io('http://localhost:3001');
// const socket = io('https://minesweeper-co-op.onrender.com/');

export default function Home() {

  const {
    register: createRegister,
    handleSubmit: handleCreateSubmit,
    formState: { errors: createErrors },
  } = useForm<FormValues>()

  const {
    register: joinRegister,
    handleSubmit: handleJoinSubmit,
    formState: { errors: joinErrors },
  } = useForm<FormValues>()

  const createOnSubmit = handleCreateSubmit((data) => createRoom(data.roomCode));
  const joinOnSubmit = handleJoinSubmit((data) => joinRoom(data.roomCode));

  const { board, gameOver, gameWon, room, playerJoined,
    numRows, numCols, numMines, difficulty,
    setBoard, setGameOver, setGameWon, setRoom, setPlayerJoined,
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
    // resetGame();
  }

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
    <Container maxW={"4xl"}>

      {!playerJoined ? (
        <Center>
          <div className="mt-40">
            <p className="text-5xl font-bold">Minesweeper Co-op</p>
            <div className="mt-10">
              <p className="text-2xl">Create a Room</p>
            </div>
            <form onSubmit={createOnSubmit}>
              <Stack gap="4" align="flex-start" maxW="sm">
                <Field
                  label="Enter Room Code:"
                  invalid={!!createErrors.roomCode}
                  errorText={createErrors.roomCode?.message}
                >
                  <Input variant="subtle"
                    {...createRegister("roomCode", { required: "Room Code is required" })}
                  />
                </Field>
                <RadioCardRoot variant={"subtle"} defaultValue={difficulty}>
                  <HStack align="stretch" >
                    {difficultyConfig.map((item) => (
                      <RadioCardItem
                        onClick={() => { setDimensions(item.rows, item.cols, item.mines, item.title) }}
                        label={item.title}
                        description={`${item.rows}x${item.cols}, ${item.mines} mines`}
                        key={item.title}
                        value={item.title}
                      />
                    ))}
                  </HStack>
                </RadioCardRoot>
                <Button variant={"surface"} px={4} type="submit">Submit</Button>
              </Stack>
            </form>

            <form onSubmit={joinOnSubmit}>
              <Field
                label="Enter Room Code:"
                invalid={!!joinErrors.roomCode}
                errorText={joinErrors.roomCode?.message}
              >
                <Input variant="subtle"
                  {...joinRegister("roomCode", { required: "Room Code is required" })}
                />
              </Field>
              <Button variant={"surface"} px={4} type="submit">Submit</Button>
            </form>
            <p className="mt-10">Rules</p>
            <p>1) Create a room code (Can be anything you want)</p>
            <p>2) Tell your friends the code</p>
            <p>3) Play together!</p>
          </div>
        </Center>
      ) : (
        <>
          <p onClick={leaveRoom}>Exit to Menu</p>
          {gameWon &&
            <p>YOU WON THE GAME</p>
          }
          {gameOver &&
            <p>YOU LOST!</p>
          }
          <p onClick={resetGame}>Reset</p>

          <SimpleGrid columns={numCols}>
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

const difficultyConfig = [
  {
    rows: 8,
    cols: 8,
    mines: 10,
    title: "Easy",
  },
  {
    rows: 13,
    cols: 15,
    mines: 40,
    title: "Medium",
  },
  {
    rows: 16,
    cols: 16,
    mines: 60,
    title: "Hard",

  },
  {
    rows: 16,
    cols: 30,
    mines: 99,
    title: "Expert",
  },
] 