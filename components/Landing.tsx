import React from 'react';
import { HStack, Center, Container } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { useMinesweeperStore } from '@/app/store';
import {
    RadioCardItem,
    RadioCardRoot,
} from "@/components/ui/radio-card";
import { BOARD_SIZES, CUSTOM_SIZE, DIFFICULTY_LEVELS, DEFAULT_SIZE, BOARD_LIMITS, isValidBoardConfig, mineCountFor } from "@/shared/boardConfig";
import { DIALOGS, openDialog, closeDialog } from "@/lib/dialogs";
import { ROOM_QUERY_PARAM } from "@/lib/roomLink";

interface FormValues {
    roomCode: string
}

/**
 * The custom dialog no longer asks for a mine count — difficulty supplies the
 * density, so mines are derived from whatever dimensions are typed here.
 */
interface CustomFormValues {
    rows: number,
    cols: number
}

interface LandingParams {
    createRoom: () => void;
    joinRoom: () => void;
}

/**
 * A radio card's one-line description.
 *
 * The pixel font is ~14px per glyph, so "48 mines" wraps inside a card once
 * four of them share the row — which is exactly the layout the size and
 * difficulty selectors need. Smaller and non-wrapping keeps every card one line
 * tall, which is what makes room for the third option row.
 */
const CardNote = ({ children }: { children: React.ReactNode }) => (
    <span className="whitespace-nowrap text-[11px]">{children}</span>
);

interface OptionRowProps {
    label: string;
    ariaLabel: string;
    value: string;
    children: React.ReactNode;
}

/**
 * One labeled row of radio cards — Mode, Board Size and Difficulty all share
 * this shell. Extracted so the responsive overflow behaviour is one place to
 * change instead of three, and adding a fourth row is one line, not six.
 */
const OptionRow = ({ label, ariaLabel, value, children }: OptionRowProps) => (
    <Field label={label} mt={3}>
        <RadioCardRoot
            width={"100%"}
            maxW={"100%"}
            overflowX={{ base: "scroll", md: "hidden" }}
            variant={"subtle"}
            size={"sm"}
            value={value}
            aria-label={ariaLabel}>
            <HStack align="stretch">
                {children}
            </HStack>
        </RadioCardRoot>
    </Field>
);


export default function Landing({ createRoom, joinRoom }: LandingParams) {

    const [bannerVisible, setBannerVisible] = React.useState(true);
    const { numRows, numCols, numMines, boardSize, difficulty, mode, setBoardSize, setBoardConfig, setMode, setRoom, setName } = useMinesweeperStore();
    const {
        register: createRegister,
        handleSubmit: handleCreateSubmit,
        formState: { errors: createErrors },
    } = useForm<FormValues>()

    const {
        register: joinRegister,
        handleSubmit: handleJoinSubmit,
        setValue: setJoinValue,
        formState: { errors: joinErrors },
    } = useForm<FormValues>()

    const {
        register: customRegister,
        handleSubmit: handleCustomSubmit,
        watch: customWatch,
        formState: { errors: customErrors },
    } = useForm<CustomFormValues>()

    // Live preview of what the typed dimensions work out to at the selected
    // difficulty. Watched rather than read on submit so the number updates as
    // you type, which is the only feedback that the mine count is derived.
    const customPreviewRows = Number(customWatch("rows"));
    const customPreviewCols = Number(customWatch("cols"));
    const customPreviewMines = mineCountFor(customPreviewRows, customPreviewCols, difficulty);
    const customPreviewValid = isValidBoardConfig(customPreviewRows, customPreviewCols, customPreviewMines);

    /** Mines a difficulty would produce at the current dimensions — the card labels. */
    const minesAt = (difficultyTitle: string) => mineCountFor(numRows, numCols, difficultyTitle);

    /**
     * A join link (?room=...) pre-fills the room code and jumps straight to the
     * name dialog, skipping the "type the code in yourself" step. The param is
     * stripped from the URL right after so a refresh or leaving-and-returning
     * doesn't reopen the dialog.
     */
    React.useEffect(() => {
        const roomParam = new URLSearchParams(window.location.search).get(ROOM_QUERY_PARAM)?.trim().slice(0, 200);
        if (!roomParam) return;

        setRoom(roomParam);
        setJoinValue("roomCode", roomParam);
        openDialog(DIALOGS.nameJoin);

        const url = new URL(window.location.href);
        url.searchParams.delete(ROOM_QUERY_PARAM);
        window.history.replaceState(null, '', url.toString());
    }, [setRoom, setJoinValue]);

    const createOnSubmit = handleCreateSubmit((data) => {
        // Unreachable today: every path into the store goes through
        // setBoardConfig, and the custom dialog validates before applying.
        // Kept as a backstop so a future writer that skips the derivation
        // surfaces here rather than as a rejected createRoom.
        if (!isValidBoardConfig(numRows, numCols, numMines)) {
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

        // The same check the server will run, so a board the server would
        // reject can no longer be accepted here and fail later. Only the
        // dimensions can be wrong now — the derived mine count is valid by
        // construction for any in-range board.
        if (!isValidBoardConfig(rows, cols, mineCountFor(rows, cols, difficulty))) {
            openDialog(DIALOGS.customError);
            return;
        }

        setBoardConfig(CUSTOM_SIZE, difficulty, { rows, cols });
        closeDialog(DIALOGS.custom);
    })

    const cancelCustom = () => {
        // Back to the default SIZE, keeping the chosen difficulty: the two are
        // independent now, so backing out of the dimensions dialog is no reason
        // to throw away a difficulty the player picked separately.
        setBoardConfig(DEFAULT_SIZE, difficulty);
        closeDialog(DIALOGS.custom);
    }

    const openCustom = () => {
        setBoardSize(CUSTOM_SIZE);
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

            {/*
              * Tighter than it was (pt-10 lg:pt-20). With three option rows the
              * create form only fits an 800px-tall viewport if the header gives
              * some space back.
              */}
            <div className="text-center pt-4 lg:pt-8">
                <h1 className="text-2xl md:text-4xl font-bold">Minesweeper Co-op</h1>
            </div>
            <Center pb={12}>
                <Container maxW={"2xl"}>
                    {/*
                      * Join comes FIRST, and its input and button share one row.
                      * Joining is a single field, but it used to sit under the
                      * whole create form -- with mode, size and difficulty above
                      * it, the Join button fell below the fold on a normal
                      * laptop viewport. Creating a room is the longer task and
                      * the one people scroll for.
                      */}
                    <p className="text-xl mt-6">Join an Existing Room:</p>
                    <form onSubmit={joinOnSubmit} className="mt-2" aria-label="Join existing room form">
                        <div className="flex items-start gap-3">
                            <div className="flex-1">
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
                            </div>
                            <button type="submit" className="nes-btn is-primary text-xs shrink-0" aria-label="Join room">Join</button>
                        </div>
                    </form>

                    <p className="my-4" id={"horizontal"}>Or</p>

                    <p className="text-xl">Create a New Room:</p>
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
                        {/*
                          * Three option rows now instead of two, so the cards are
                          * size="sm" with one-line descriptions. That buys back
                          * roughly what the extra row costs. Difficulty's cards
                          * show what each density works out to at the size
                          * selected above, which is also what keeps them one line.
                          */}
                        <OptionRow label={"Select Mode:"} ariaLabel="Select game mode" value={mode}>
                            <RadioCardItem
                                onClick={() => setMode("co-op")}
                                label="Co-op"
                                description={<CardNote>One shared board</CardNote>}
                                value="co-op"
                            />
                            <RadioCardItem
                                onClick={() => setMode("pvp")}
                                label="PvP"
                                description={<CardNote>Race an opponent</CardNote>}
                                value="pvp"
                            />
                        </OptionRow>
                        <OptionRow label={"Board Size:"} ariaLabel="Select board size" value={boardSize}>
                            {BOARD_SIZES.map((item) => (
                                <RadioCardItem
                                    onClick={() => setBoardConfig(item.title, difficulty)}
                                    label={item.title}
                                    description={<CardNote>{item.rows}x{item.cols}</CardNote>}
                                    key={item.title}
                                    value={item.title}
                                />
                            ))}
                            <RadioCardItem
                                description={<CardNote>{(boardSize === CUSTOM_SIZE && numRows > 0) ? `${numRows}x${numCols}` : `__x__`}</CardNote>}
                                label={CUSTOM_SIZE}
                                value={CUSTOM_SIZE}
                                onClick={openCustom}
                            />
                        </OptionRow>
                        <OptionRow label={"Select Difficulty:"} ariaLabel="Select game difficulty" value={difficulty}>
                            {DIFFICULTY_LEVELS.map((level) => (
                                <RadioCardItem
                                    onClick={() => setBoardConfig(boardSize, level.title)}
                                    label={level.title}
                                    description={<CardNote>{minesAt(level.title)} mines</CardNote>}
                                    key={level.title}
                                    value={level.title}
                                />
                            ))}
                        </OptionRow>
                        <div className="mt-2">
                            <button type="submit" className="nes-btn is-primary text-xs" aria-label="Create room with selected settings">Create</button>
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
                    {/*
                      * The old copy named the mines-under-half rule, which a
                      * player can no longer break -- mines are derived from the
                      * difficulty now. What is left is the dimension range.
                      */}
                    <p id="custom-error-title">There was an error with your customization:</p>
                    <p className="text-xs">
                        Rows must be between {BOARD_LIMITS.MIN_ROWS} and {BOARD_LIMITS.MAX_ROWS},
                        and columns between {BOARD_LIMITS.MIN_COLS} and {BOARD_LIMITS.MAX_COLS}.
                    </p>
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
                    {/*
                      * No mine field: difficulty owns the density, so the count
                      * is derived. Showing it live is what makes that legible --
                      * otherwise you would pick dimensions and not learn how
                      * many mines you got until the board rendered.
                      */}
                    <p className="mt-4 mb-0 text-xs" aria-live="polite">
                        {customPreviewValid
                            ? `${difficulty}: ${customPreviewMines} mines`
                            : `${difficulty}: enter dimensions above`}
                    </p>
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
