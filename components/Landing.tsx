import React from 'react';
import { HStack, Center, Container } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { useMinesweeperStore } from '@/app/store';
import {
    RadioCardItem,
    RadioCardRoot,
} from "@/components/ui/radio-card";
import { difficultyConfig } from "@/lib/difficultyConfig";
import "nes.css/css/nes.min.css";

interface FormValues {
    roomCode: string
}

interface CustomFormValues {
    rows: number,
    cols: number,
    mines: number
}

interface LandingParams {
    createRoom: () => void;
    joinRoom: () => void;
}


export default function Landing({ createRoom, joinRoom }: LandingParams) {

    const { numRows, numCols, numMines, difficulty, setDifficulty, setDimensions, setRoom, setName } = useMinesweeperStore();
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

    const {
        register: customRegister,
        handleSubmit: handleCustomSubmit,
        formState: { errors: customErrors },
    } = useForm<CustomFormValues>()

    const createOnSubmit = handleCreateSubmit((data) => {
        if (difficulty === "Custom" && (numRows === 0 || numCols === 0 || numMines === 0)) {
            (document.getElementById('dialog-custom-error') as HTMLDialogElement)?.showModal();
            return;
        }
        setRoom(data.roomCode);
        (document.getElementById('dialog-name-create') as HTMLDialogElement)?.showModal();
    });

    const joinOnSubmit = handleJoinSubmit((data) => {
        setRoom(data.roomCode);
        (document.getElementById('dialog-name-join') as HTMLDialogElement)?.showModal();
    });

    const customOnSubmit = handleCustomSubmit((data) => {
        const rows = parseInt(data.rows.toString())
        const cols = parseInt(data.cols.toString())
        const mines = parseInt(data.mines.toString())

        // Validate board size and mine count
        if (mines >= (rows * cols) / 2){
            (document.getElementById('dialog-custom-error') as HTMLDialogElement)?.showModal();
            return;
        }
        // Ensure board is large enough for exclusion zone (3x3 = 9 cells)
        if (rows * cols < 20 || rows < 3 || cols < 3){
            (document.getElementById('dialog-custom-error') as HTMLDialogElement)?.showModal();
            return;
        }
        // Ensure there's at least some safe spaces after exclusion
        const availableSpaces = (rows * cols) - 9; // Exclude 3x3 around first click
        if (mines > availableSpaces - 5){
            (document.getElementById('dialog-custom-error') as HTMLDialogElement)?.showModal();
            return;
        }

        setDimensions(rows, cols, mines);
        (document.getElementById('dialog-custom') as HTMLDialogElement)?.close();
    })

    const cancelCustom = () => {
        // Reset to Medium difficulty instead of invalid 0,0,0
        setDimensions(15, 13, 40);
        setDifficulty("Medium");
        (document.getElementById('dialog-custom') as HTMLDialogElement)?.close();
    }

    const openCustom = () => {
        setDifficulty("Custom");
        (document.getElementById('dialog-custom') as HTMLDialogElement)?.showModal();
    }

    return (
        <>
            <div className="text-center pt-10 lg:pt-20">
                <p className="text-2xl md:text-4xl font-bold">Minesweeper Co-op</p>
            </div>
            <Center pb={12}>
                <Container maxW={"2xl"}>
                    <p className="text-xl mt-10">Create a New Room:</p>

                    <form onSubmit={createOnSubmit} className="mt-2">
                        <Field
                            invalid={!!createErrors.roomCode}
                            errorText={createErrors.roomCode?.message}
                        >

                            <input className="nes-input text-xs" maxLength={28} type="text" placeholder={"Enter Room Code"}
                                {...createRegister("roomCode", { required: "Room Code is required." })} />
                        </Field>
                        <Field label={"Select Difficulty:"} mt={5}>
                            <RadioCardRoot maxW={"100%"} overflowX={{base: "scroll", md: "hidden"}} variant={"subtle"} value={difficulty}>
                                <HStack align="stretch">
                                    {difficultyConfig.map((item) => (
                                        <RadioCardItem
                                            onClick={() => { setDimensions(item.rows, item.cols, item.mines); setDifficulty(item.title) }}
                                            label={item.title}
                                            description={`${item.rows}x${item.cols}, ${item.mines} mines`}
                                            key={item.title}
                                            value={item.title}
                                        />
                                    ))}
                                    <RadioCardItem
                                        
                                        description={(difficulty === "Custom" && (numRows !== 0)) ? `${numRows}x${numCols}, ${numMines} mines` : `__x__, __ mines`}
                                        label={"Custom"}
                                        value={"Custom"}
                                        onClick={() => {setDifficulty("Custom"); openCustom() }}
                                    />
                                </HStack>
                            </RadioCardRoot>
                        </Field>
                        <div className="mt-2">
                            <button type="submit" className="nes-btn is-primary text-xs">Create</button>
                        </div>
                    </form>
                    <p className="my-5" id={"horizontal"}>Or</p>
                    <p className="text-xl">Join an Existing Room:</p>
                    <form onSubmit={joinOnSubmit} className="mt-2">
                        <Field
                            invalid={!!joinErrors.roomCode}
                            errorText={joinErrors.roomCode?.message}
                        >

                            <input type="text" maxLength={28} placeholder={"Enter Room Code"} className="nes-input text-xs"
                                {...joinRegister("roomCode", { required: "Room Code is required." })} />
                        </Field>
                        <div className="mt-4">
                            <button type="submit" className="nes-btn is-primary text-xs">Join</button>
                        </div>
                    </form>
                </Container>
            </Center>

            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-name-create">
                <form method="dialog">
                    <p>Enter your Name:</p>
                    <div className="nes-field mb-4">
                        <input type="text" name="name" maxLength={16} minLength={1} required className="nes-input text-sm" onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="flex justify-between">
                        <button type="button" className="nes-btn" onClick={() => {
                            (document.getElementById('dialog-name-create') as HTMLDialogElement)?.close();
                        }}>Cancel</button>
                        <button onClick={(e) => {
                            const input = document.querySelector('#dialog-name-create input[name="name"]') as HTMLInputElement;
                            const nameValue = input?.value || '';
                            if (!nameValue || nameValue.trim().length === 0) {
                                e.preventDefault();
                                alert('Please enter a valid name');
                                return;
                            }
                            setName(nameValue);
                            setTimeout(() => createRoom(), 0);
                        }} type="submit" className="nes-btn is-success">Confirm</button>
                    </div>
                </form>
            </dialog>
            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-name-join">
                <form method="dialog">
                    <p>Enter your Name:</p>
                    <div className="nes-field mb-4">
                        <input type="text" name="name" maxLength={16} minLength={1} required className="nes-input text-sm" onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="flex justify-between">
                        <button type="button" className="nes-btn" onClick={() => {
                            (document.getElementById('dialog-name-join') as HTMLDialogElement)?.close();
                        }}>Cancel</button>
                        <button onClick={(e) => {
                            const input = document.querySelector('#dialog-name-join input[name="name"]') as HTMLInputElement;
                            const nameValue = input?.value || '';
                            if (!nameValue || nameValue.trim().length === 0) {
                                e.preventDefault();
                                alert('Please enter a valid name');
                                return;
                            }
                            setName(nameValue);
                            setTimeout(() => joinRoom(), 0);
                        }} type="submit" className="nes-btn is-success">Confirm</button>
                    </div>
                </form>
            </dialog>

            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-custom-error">
                <form method="dialog">
                    <p>There was an error with your customization:</p>
                    <p>1) Mines must be less than half the area of the board.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn">Cancel</button>
                    </div>
                </form>
            </dialog>

            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-custom">
                <form onSubmit={customOnSubmit} method="dialog">
                    <p>Customize your Board:</p>
                    <Field
                        invalid={!!customErrors.rows}
                        errorText={customErrors.rows?.message}
                    >
                        <p className="mb-0">Number of Rows:</p>
                        <input type="number" defaultValue={numRows} className="nes-input text-xs" maxLength={28} min={8} max={32} placeholder={"Between 8 - 32"}
                            {...customRegister("rows", { required: "Number of Rows is Required." })} />
                    </Field>
                    <Field
                        invalid={!!customErrors.cols}
                        errorText={customErrors.cols?.message}
                    >
                        <p className="mb-0 mt-4">Number of Columns:</p>
                        <input className="nes-input text-xs" defaultValue={numCols} maxLength={28} type="number" min={8} max={16} placeholder={"Between 8 - 16"}
                            {...customRegister("cols", { required: "Number of Columns is Required." })} />
                    </Field>
                    <Field
                        invalid={!!customErrors.mines}
                        errorText={customErrors.mines?.message}
                    >
                        <p className="mb-0 mt-4">Number of Mines</p>
                        <input className="nes-input text-xs" defaultValue={numMines} maxLength={28} min={1} type="number" placeholder={"Min: 1"}
                            {...customRegister("mines", { required: "Number of Mines is Required." })} />
                    </Field>
                    <div className="flex justify-between mt-5">
                        <button onClick={cancelCustom} type="button" className="nes-btn">Cancel</button>
                        <button type="submit" className="nes-btn is-success">Confirm</button>
                    </div>
                </form>
            </dialog>

        </>
    )
}
