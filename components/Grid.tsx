import React, { useEffect } from 'react';
import { Center, Container, HStack, VStack, Box } from "@chakra-ui/react";
import { useMinesweeperStore } from '@/app/store';
import Cell from "@/components/Cell";

import { Switch } from "@/components/ui/switch";

interface GridParams {
    leaveRoom: () => void;
    resetGame: () => void;
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
    chordCell: (row: number, col: number) => void;
    emitConfetti: () => void;
}

export default function Grid({ leaveRoom, resetGame, toggleFlag, openCell, chordCell, emitConfetti }: GridParams) {

    const { r, c, leftClick, rightClick, isChecked, room, playerNamesInRoom, board,
        gameOver, gameWon, setIsChecked, setBothPressed } = useMinesweeperStore();

    const openPlayersDialog = () => {
        (document.getElementById('dialog-players') as HTMLDialogElement)?.showModal();
    }

    useEffect(() => {
        // Check if both buttons are pressed
        if (leftClick && rightClick) {
            setBothPressed(true);
            chordCell(r, c);
            return;
        }

        // Release lock when both buttons are released
        if (!leftClick && !rightClick) {
            setBothPressed(false);
        }
    }, [leftClick, rightClick]);


    return (
        <>
            <Container minH={"94vh"} pb={{ base: 6, xl: 16 }} maxW={"1350px"} pt={{ base: 10, xl: 20 }}>

                <p className="text-center font-bold text-2xl md:text-4xl">Minesweeper Co-Op</p>

                <Center hideBelow={"xl"} justifyContent={"space-around"} alignItems={"flex-start"} mt={16} gap={20}>
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
                                    <span className="is-success" onClick={emitConfetti}>GAME WON!</span>
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

                <Center hideFrom={"xl"} mt={10}>
                    <VStack>
                        <HStack gap={8}>
                            <button type="button" className="nes-btn is-warning text-xs" onClick={leaveRoom}>Return to Home</button>
                            <button type="button" className="nes-btn text-xs is-primary" onClick={resetGame}>Reset Board</button>
                        </HStack>

                        <HStack gap={8}>
                            <div className="my-6 bg-slate-100 nes-container is-centered with-title max-w-60">
                                <p className="title text-xs">Room:</p>
                                <p className="text-sm"> {room}</p>
                            </div>
                            <i className="nes-icon trophy is-medium" onClick={openPlayersDialog}></i>
                        </HStack>
                        <Box hideFrom={"sm"}>
                            <HStack gap={5}>

                                <Switch
                                    defaultChecked
                                    onCheckedChange={(e) => setIsChecked(e.checked)}
                                    size="lg"
                                    colorScheme="blue"
                                />
                                <p className="mt-1.5">{isChecked ? "Click" : "Flag"} Mode</p>
                            </HStack>
                        </Box>
                    </VStack>
                </Center>
                <Center hideFrom={"xl"} mt={5}>
                    <div className="overflow-scroll">
                        <Center>
                            {gameWon &&
                                <a className="nes-badge pb-12">
                                    <span className="is-success" onClick={emitConfetti}>GAME WON!</span>
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

                                    <tr key={rowIndex} className="overflow-scroll">
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
                </Center>
            </Container>
            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-players">
                <form method="dialog">
                    <p className="title">Players Online!</p>
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
                                        <td className="text-sm max-w-60">{item.name}</td>
                                        <td className="text-sm">{item.score}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <menu className="dialog-menu justify-end flex mt-6">
                        <button className="nes-btn">Cancel</button>
                    </menu>
                </form>
            </dialog>
        </>
    )
}
