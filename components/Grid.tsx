import React from 'react';
import { Center, Container } from "@chakra-ui/react";
import { useMinesweeperStore } from '@/app/store';
import Cell from "@/components/Cell";

interface GridParams {
    leaveRoom: () => void;
    resetGame: () => void;
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
}

export default function Grid({ leaveRoom, resetGame, toggleFlag, openCell }: GridParams) {

    const { board, gameOver, gameWon } = useMinesweeperStore();
    return (
        <>
            <Container maxW={"6xl"}>

                <div className="mx-3 mt-16 mb-10 flex justify-between">
                    <button type="button" className="nes-btn is-warning text-xs" onClick={leaveRoom}>Return to Menu</button>
                    <button type="button" className="nes-btn text-xs" onClick={resetGame}>Reset Board</button>
                </div>
                {gameWon &&
                    <p>YOU WON THE GAME</p>
                }
                {gameOver &&
                    <p>YOU LOST!</p>
                }

                <Center>
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
                </Center>
                
            </Container>
        </>
    )
}
