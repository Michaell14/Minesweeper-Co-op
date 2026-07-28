import React from 'react';
import { HStack, Center, Container } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { useMinesweeperStore } from '@/app/store';
import {
    RadioCardItem,
    RadioCardRoot,
} from "@/components/ui/radio-card";
import { DIFFICULTY_PRESETS, CUSTOM_DIFFICULTY, DEFAULT_DIFFICULTY, DEFAULT_PRESET, BOARD_LIMITS, isValidBoardConfig } from "@/shared/boardConfig";
import { DIALOGS, openDialog, closeDialog } from "@/lib/dialogs";
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

    const [bannerVisible, setBannerVisible] = React.useState(true);
    const { numRows, numCols, numMines, difficulty, mode, setDifficulty, setMode, setDimensions, setRoom, setName } = useMinesweeperStore();
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
        if (difficulty === CUSTOM_DIFFICULTY && (numRows === 0 || numCols === 0 || numMines === 0)) {
            openDialog(DIALOGS.customError);
            return;
        }
        setRoom(data.roomCode);
        openDialog(DIALOGS.nameCreate);
    });

    const joinOnSubmit = handleJoinSubmit((data) => {
        setRoom(data.roomCode);
        openDialog(DIALOGS.nameJoin);
    });

    const customOnSubmit = handleCustomSubmit((data) => {
        const rows = parseInt(data.rows.toString())
        const cols = parseInt(data.cols.toString())
        const mines = parseInt(data.mines.toString())

        // The same check the server will run, so a board the server would
        // reject can no longer be accepted here and fail later.
        if (!isValidBoardConfig(rows, cols, mines)) {
            openDialog(DIALOGS.customError);
            return;
        }

        setDimensions(rows, cols, mines);
        closeDialog(DIALOGS.custom);
    })

    const cancelCustom = () => {
        // Reset to the default preset instead of invalid 0,0,0
        setDimensions(DEFAULT_PRESET.rows, DEFAULT_PRESET.cols, DEFAULT_PRESET.mines);
        setDifficulty(DEFAULT_DIFFICULTY);
        closeDialog(DIALOGS.custom);
    }

    const openCustom = () => {
        setDifficulty(CUSTOM_DIFFICULTY);
        openDialog(DIALOGS.custom);
    }

    return (
        <>
            {/* Notification Banner */}
            {bannerVisible && (
                <div className="bg-yellow-400 text-black px-4 py-2 text-center relative flex items-center justify-center" role="banner" aria-label="Website milestone announcement">
                    <p className="text-[10px] md:text-xs m-0">
                    PvP Mode just dropped! Go head-to-head with friends. Got feedback? <a href="https://forms.gle/ALpScH8K7K2QsA8M7" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700">Tell us!</a>
                    </p>
                    <button
                        onClick={() => setBannerVisible(false)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-black hover:text-gray-700 font-bold text-lg leading-none"
                        aria-label="Close banner"
                    >
                        ×
                    </button>
                </div>
            )}

            <div className="text-center pt-10 lg:pt-20">
                <h1 className="text-2xl md:text-4xl font-bold">Minesweeper Co-op</h1>
            </div>
            <Center pb={12}>
                <Container maxW={"2xl"}>
                    <p className="text-xl mt-10">Create a New Room:</p>

                    <form onSubmit={createOnSubmit} className="mt-2" aria-label="Create new room form">
                        <Field
                            invalid={!!createErrors.roomCode}
                            errorText={createErrors.roomCode?.message}
                        >

                            <input
                                className="nes-input text-xs"
                                maxLength={28}
                                type="text"
                                placeholder={"Enter Room Code"}
                                aria-label="Room code"
                                aria-required="true"
                                {...createRegister("roomCode", { required: "Room Code is required." })} />
                        </Field>
                        <Field label={"Select Mode:"} mt={5}>
                            <RadioCardRoot
                                maxW={"100%"}
                                overflowX={{base: "scroll", md: "hidden"}}
                                variant={"subtle"}
                                value={mode}
                                aria-label="Select game mode">
                                <HStack align="stretch">
                                    <RadioCardItem
                                        onClick={() => setMode("co-op")}
                                        label="Co-op"
                                        description="Work together on one board"
                                        value="co-op"
                                    />
                                    <RadioCardItem
                                        onClick={() => setMode("pvp")}
                                        label="PvP"
                                        description="Compete against each other"
                                        value="pvp"
                                    />
                                </HStack>
                            </RadioCardRoot>
                        </Field>
                        <Field label={"Select Difficulty:"} mt={5}>
                            <RadioCardRoot
                                maxW={"100%"}
                                overflowX={{base: "scroll", md: "hidden"}}
                                variant={"subtle"}
                                value={difficulty}
                                aria-label="Select game difficulty">
                                <HStack align="stretch">
                                    {DIFFICULTY_PRESETS.map((item) => (
                                        <RadioCardItem
                                            onClick={() => { setDimensions(item.rows, item.cols, item.mines); setDifficulty(item.title) }}
                                            label={item.title}
                                            description={`${item.rows}x${item.cols}, ${item.mines} mines`}
                                            key={item.title}
                                            value={item.title}
                                        />
                                    ))}
                                    <RadioCardItem
                                        
                                        description={(difficulty === CUSTOM_DIFFICULTY && (numRows !== 0)) ? `${numRows}x${numCols}, ${numMines} mines` : `__x__, __ mines`}
                                        label={CUSTOM_DIFFICULTY}
                                        value={CUSTOM_DIFFICULTY}
                                        onClick={() => {setDifficulty(CUSTOM_DIFFICULTY); openCustom() }}
                                    />
                                </HStack>
                            </RadioCardRoot>
                        </Field>
                        <div className="mt-2">
                            <button type="submit" className="nes-btn is-primary text-xs" aria-label="Create room with selected settings">Create</button>
                        </div>
                    </form>
                    <p className="my-5" id={"horizontal"}>Or</p>
                    <p className="text-xl">Join an Existing Room:</p>
                    <form onSubmit={joinOnSubmit} className="mt-2" aria-label="Join existing room form">
                        <Field
                            invalid={!!joinErrors.roomCode}
                            errorText={joinErrors.roomCode?.message}
                        >

                            <input
                                type="text"
                                maxLength={28}
                                placeholder={"Enter Room Code"}
                                className="nes-input text-xs"
                                aria-label="Room code to join"
                                aria-required="true"
                                {...joinRegister("roomCode", { required: "Room Code is required." })} />
                        </Field>
                        <div className="mt-4">
                            <button type="submit" className="nes-btn is-primary text-xs" aria-label="Join room">Join</button>
                        </div>
                    </form>
                </Container>
            </Center>

            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.nameCreate}
                aria-labelledby="create-name-title">
                <form method="dialog">
                    <p id="create-name-title">Enter your Name:</p>
                    <div className="nes-field mb-4">
                        <input
                            type="text"
                            name="name"
                            maxLength={16}
                            minLength={1}
                            required
                            className="nes-input text-sm"
                            aria-label="Your player name"
                            aria-required="true"
                            onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="flex justify-between">
                        <button
                            type="button"
                            className="nes-btn"
                            aria-label="Cancel and close dialog"
                            onClick={() => {
                                closeDialog(DIALOGS.nameCreate);
                            }}>Cancel</button>
                        <button
                            onClick={(e) => {
                                const input = document.querySelector('#dialog-name-create input[name="name"]') as HTMLInputElement;
                                const nameValue = input?.value || '';
                                if (!nameValue || nameValue.trim().length === 0) {
                                    e.preventDefault();
                                    alert('Please enter a valid name');
                                    return;
                                }
                                setName(nameValue);
                                createRoom();
                            }}
                            type="submit"
                            className="nes-btn is-success"
                            aria-label="Confirm and create room">Confirm</button>
                    </div>
                </form>
            </dialog>
            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.nameJoin}
                aria-labelledby="join-name-title">
                <form method="dialog">
                    <p id="join-name-title">Enter your Name:</p>
                    <div className="nes-field mb-4">
                        <input
                            type="text"
                            name="name"
                            maxLength={16}
                            minLength={1}
                            required
                            className="nes-input text-sm"
                            aria-label="Your player name"
                            aria-required="true"
                            onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="flex justify-between">
                        <button
                            type="button"
                            className="nes-btn"
                            aria-label="Cancel and close dialog"
                            onClick={() => {
                                closeDialog(DIALOGS.nameJoin);
                            }}>Cancel</button>
                        <button
                            onClick={(e) => {
                                const input = document.querySelector('#dialog-name-join input[name="name"]') as HTMLInputElement;
                                const nameValue = input?.value || '';
                                if (!nameValue || nameValue.trim().length === 0) {
                                    e.preventDefault();
                                    alert('Please enter a valid name');
                                    return;
                                }
                                setName(nameValue);
                                joinRoom();
                            }}
                            type="submit"
                            className="nes-btn is-success"
                            aria-label="Confirm and join room">Confirm</button>
                    </div>
                </form>
            </dialog>

            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.customError}
                role="alertdialog"
                aria-labelledby="custom-error-title">
                <form method="dialog">
                    <p id="custom-error-title">There was an error with your customization:</p>
                    <p>1) Mines must be less than half the area of the board.</p>
                    <div className="flex justify-between">
                        <button className="nes-btn" aria-label="Close error dialog">Cancel</button>
                    </div>
                </form>
            </dialog>

            <dialog
                className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2"
                id={DIALOGS.custom}
                aria-labelledby="custom-board-title">
                <form onSubmit={customOnSubmit} method="dialog">
                    <p id="custom-board-title">Customize your Board:</p>
                    <Field
                        invalid={!!customErrors.rows}
                        errorText={customErrors.rows?.message}
                    >
                        <p className="mb-0">Number of Rows:</p>
                        <input
                            type="number"
                            defaultValue={numRows}
                            className="nes-input text-xs"
                            maxLength={28}
                            min={BOARD_LIMITS.MIN_ROWS}
                            max={BOARD_LIMITS.MAX_ROWS}
                            placeholder={`Between ${BOARD_LIMITS.MIN_ROWS} - ${BOARD_LIMITS.MAX_ROWS}`}
                            aria-label={`Number of rows, between ${BOARD_LIMITS.MIN_ROWS} and ${BOARD_LIMITS.MAX_ROWS}`}
                            aria-required="true"
                            {...customRegister("rows", { required: "Number of Rows is Required." })} />
                    </Field>
                    <Field
                        invalid={!!customErrors.cols}
                        errorText={customErrors.cols?.message}
                    >
                        <p className="mb-0 mt-4">Number of Columns:</p>
                        <input
                            className="nes-input text-xs"
                            defaultValue={numCols}
                            maxLength={28}
                            type="number"
                            min={BOARD_LIMITS.MIN_COLS}
                            max={BOARD_LIMITS.MAX_COLS}
                            placeholder={`Between ${BOARD_LIMITS.MIN_COLS} - ${BOARD_LIMITS.MAX_COLS}`}
                            aria-label={`Number of columns, between ${BOARD_LIMITS.MIN_COLS} and ${BOARD_LIMITS.MAX_COLS}`}
                            aria-required="true"
                            {...customRegister("cols", { required: "Number of Columns is Required." })} />
                    </Field>
                    <Field
                        invalid={!!customErrors.mines}
                        errorText={customErrors.mines?.message}
                    >
                        <p className="mb-0 mt-4">Number of Mines</p>
                        <input
                            className="nes-input text-xs"
                            defaultValue={numMines}
                            maxLength={28}
                            min={BOARD_LIMITS.MIN_MINES}
                            type="number"
                            placeholder={`Min: ${BOARD_LIMITS.MIN_MINES}`}
                            aria-label={`Number of mines, minimum ${BOARD_LIMITS.MIN_MINES}`}
                            aria-required="true"
                            {...customRegister("mines", { required: "Number of Mines is Required." })} />
                    </Field>
                    <div className="flex justify-between mt-5">
                        <button
                            onClick={cancelCustom}
                            type="button"
                            className="nes-btn"
                            aria-label="Cancel custom board settings">Cancel</button>
                        <button
                            type="submit"
                            className="nes-btn is-success"
                            aria-label="Confirm custom board settings">Confirm</button>
                    </div>
                </form>
            </dialog>

        </>
    )
}
