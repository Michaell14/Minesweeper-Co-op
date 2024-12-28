import React, { useEffect } from 'react';
import { Center, Container } from "@chakra-ui/react";
import { useMinesweeperStore } from '@/app/store';
import Cell from "@/components/Cell";
import { shootConfetti } from "@/lib/confetti";

interface GridParams {
    leaveRoom: () => void;
    resetGame: () => void;
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
}

export default function Grid({ leaveRoom, resetGame, toggleFlag, openCell }: GridParams) {

    const { room, playerNamesInRoom, board, gameOver, gameWon } = useMinesweeperStore();

    return (
        <>
            <Container maxW={"1350px"} pt={20}>

                <p className="text-center text-4xl">Minesweeper Co-Op</p>

                <Center justifyContent={"space-around"} alignItems={"flex-start"} mt={16} mb={20} gap={20}>
                    <div className="flex flex-col sticky top-20">
                        <button type="button" className="nes-btn is-warning text-xs" onClick={leaveRoom}>Return to Home</button>
                        <div className="bg-slate-100 nes-container with-title max-w-60 mt-6">
                            <p className="title text-xs">Room:</p>
                            <p className="text-sm"> {room}</p>
                        </div>
                    </div>
                    <div>
                        <Center>
                            {gameWon &&
                                <a className="nes-badge pb-12">
                                    <span className="is-success" onClick={shootConfetti}>GAME WON!</span>
                                </a>
                            }
                            {gameOver &&
                                <a className="nes-badge pb-12">
                                    <span className="is-error">GAME LOST!</span>
                                </a>
                            }
                        </Center>
                        <table className="flex">
                            <tbody>
                                {board.map((row: any, rowIndex: number) => (

                                    <tr key={rowIndex}>
                                        {row.map((cell: any, colIndex: number) => (
                                            <Cell
                                                key={colIndex}
                                                cell={cell}
                                                row={rowIndex}
                                                col={colIndex}
                                                toggleFlag={toggleFlag}
                                                openCell={openCell} />
                                        ))}
                                    </tr>

                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-col sticky top-20">
                        <button type="button" className="nes-btn text-xs is-primary" onClick={resetGame}>Reset Board</button>

                        <div className="nes-table-responsive mt-6">
                            <table className="nes-table is-bordered is-centered">
                                <thead>
                                    <tr>
                                        <th>Player</th>
                                        <th>Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {playerNamesInRoom.map((item, index) => (
                                        <tr key={index}>
                                            <td className="text-sm max-w-40">{item.name}</td>
                                            <td className="text-sm">{item.score}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                        </div>
                    </div>
                </Center>

            </Container>
        </>
    )
}
