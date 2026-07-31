import React from 'react';
import { useForm } from "react-hook-form";
import { useMinesweeperStore } from '@/app/store';
import {
    Button,
    Dialog,
    DialogClose,
    Field,
    Input,
    RadioCard,
    RadioCardGroup,
} from "@/components/ds";
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
    <span className="whitespace-nowrap text-pixel-xs">{children}</span>
);

interface OptionRowProps {
    label: string;
    ariaLabel: string;
    /** Radio `name`, unique per row so the three groups don't fight. */
    name: string;
    value: string;
    onChange: (value: string) => void;
    children: React.ReactNode;
}

/**
 * One labeled row of radio cards — Mode, Board Size and Difficulty all share
 * this shell. Extracted so the responsive overflow behaviour is one place to
 * change instead of three, and adding a fourth row is one line, not six.
 */
const OptionRow = ({ label, ariaLabel, name, value, onChange, children }: OptionRowProps) => (
    <Field label={label} className="mt-3">
        <RadioCardGroup name={name} value={value} onChange={onChange} ariaLabel={ariaLabel}>
            {children}
        </RadioCardGroup>
    </Field>
);

interface NameDialogProps {
    id: typeof DIALOGS.nameCreate | typeof DIALOGS.nameJoin;
    confirmLabel: string;
    onConfirm: () => void;
    setName: (name: string) => void;
}

/**
 * "Enter your Name", shown before both creating and joining.
 *
 * The two were separate copies of identical markup differing only in which
 * action they called — including two copies of a validity check that reached
 * back into the DOM with `document.querySelector('#dialog-name-create
 * input[name=name]')` to read the value it had just written to the store.
 * A ref reads the same input without needing to know the dialog's own id.
 */
const NameDialog = ({ id, confirmLabel, onConfirm, setName }: NameDialogProps) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    const confirm = (e: React.MouseEvent) => {
        const nameValue = inputRef.current?.value ?? '';
        if (nameValue.trim().length === 0) {
            e.preventDefault();
            alert('Please enter a valid name');
            return;
        }
        setName(nameValue);
        onConfirm();
    };

    return (
        <Dialog
            id={id}
            title="Enter your Name:"
            actionsAlign="between"
            actions={
                <>
                    <Button
                        aria-label="Cancel and close dialog"
                        onClick={() => closeDialog(id)}>Cancel</Button>
                    <DialogClose
                        intent="success"
                        onClick={confirm}
                        aria-label={confirmLabel}>Confirm</DialogClose>
                </>
            }>
            <Input
                ref={inputRef}
                type="text"
                name="name"
                maxLength={16}
                minLength={1}
                required
                className="mb-4"
                aria-label="Your player name"
                aria-required="true"
                onChange={(e) => setName(e.target.value)} />
        </Dialog>
    );
};


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
                <div className="bg-surface-banner text-ink-banner px-4 py-2 text-center relative flex items-center justify-center" role="banner" aria-label="Website milestone announcement">
                    <p className="text-pixel-2xs md:text-pixel-sm m-0">
                    PvP Mode just dropped! Go head-to-head with friends. Got feedback? <a href="https://forms.gle/ALpScH8K7K2QsA8M7" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink-muted-hover">Tell us!</a>
                    </p>
                    <button
                        onClick={() => setBannerVisible(false)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-banner hover:text-ink-muted-hover font-bold text-pixel-lg leading-none"
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
                <h1 className="text-pixel-2xl md:text-pixel-4xl font-bold">Minesweeper Co-op</h1>
            </div>
            {/* Chakra <Center pb={12}><Container maxW="2xl"> — 672px is
                max-w-2xl exactly, and the container's own inline padding was
                16px, i.e. px-4. */}
            <div className="flex justify-center pb-12">
                <div className="w-full max-w-2xl mx-auto px-4">
                    {/*
                      * Join comes FIRST, and its input and button share one row.
                      * Joining is a single field, but it used to sit under the
                      * whole create form -- with mode, size and difficulty above
                      * it, the Join button fell below the fold on a normal
                      * laptop viewport. Creating a room is the longer task and
                      * the one people scroll for.
                      */}
                    <p className="text-pixel-xl mt-6">Join an Existing Room:</p>
                    <form onSubmit={joinOnSubmit} className="mt-2" aria-label="Join existing room form">
                        <div className="flex items-start gap-3">
                            <div className="flex-1">
                                <Field
                                    invalid={!!joinErrors.roomCode}
                                    errorText={joinErrors.roomCode?.message}
                                >
                                    <Input
                                        type="text"
                                        size="sm"
                                        maxLength={28}
                                        placeholder={"Enter Room Code"}
                                        invalid={!!joinErrors.roomCode}
                                        aria-label="Room code to join"
                                        aria-required="true"
                                        {...joinRegister("roomCode", { required: "Room Code is required." })} />
                                </Field>
                            </div>
                            <Button type="submit" intent="primary" size="sm" className="shrink-0" aria-label="Join room">Join</Button>
                        </div>
                    </form>

                    <p className="my-4" id={"horizontal"}>Or</p>

                    <p className="text-pixel-xl">Create a New Room:</p>
                    <form onSubmit={createOnSubmit} className="mt-2" aria-label="Create new room form">
                        <Field
                            invalid={!!createErrors.roomCode}
                            errorText={createErrors.roomCode?.message}
                        >

                            <Input
                                size="sm"
                                maxLength={28}
                                type="text"
                                placeholder={"Enter Room Code"}
                                invalid={!!createErrors.roomCode}
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
                        <OptionRow
                            label={"Select Mode:"}
                            ariaLabel="Select game mode"
                            name="mode"
                            value={mode}
                            onChange={(v) => setMode(v as "co-op" | "pvp")}>
                            <RadioCard
                                label="Co-op"
                                description={<CardNote>One shared board</CardNote>}
                                value="co-op"
                            />
                            <RadioCard
                                label="PvP"
                                description={<CardNote>Race an opponent</CardNote>}
                                value="pvp"
                            />
                        </OptionRow>
                        <OptionRow
                            label={"Board Size:"}
                            ariaLabel="Select board size"
                            name="boardSize"
                            value={boardSize}
                            onChange={(v) => { if (v !== CUSTOM_SIZE) setBoardConfig(v, difficulty); }}>
                            {BOARD_SIZES.map((item) => (
                                <RadioCard
                                    label={item.title}
                                    description={<CardNote>{item.rows}x{item.cols}</CardNote>}
                                    key={item.title}
                                    value={item.title}
                                />
                            ))}
                            {/*
                              * Custom is the one card that does not just set a
                              * value — it opens the dimensions dialog, every
                              * time it is clicked, including when it is already
                              * selected. That is what onSelect is for.
                              */}
                            <RadioCard
                                description={<CardNote>{(boardSize === CUSTOM_SIZE && numRows > 0) ? `${numRows}x${numCols}` : `__x__`}</CardNote>}
                                label={CUSTOM_SIZE}
                                value={CUSTOM_SIZE}
                                onSelect={openCustom}
                            />
                        </OptionRow>
                        <OptionRow
                            label={"Select Difficulty:"}
                            ariaLabel="Select game difficulty"
                            name="difficulty"
                            value={difficulty}
                            onChange={(v) => setBoardConfig(boardSize, v)}>
                            {DIFFICULTY_LEVELS.map((level) => (
                                <RadioCard
                                    label={level.title}
                                    description={<CardNote>{minesAt(level.title)} mines</CardNote>}
                                    key={level.title}
                                    value={level.title}
                                />
                            ))}
                        </OptionRow>
                        <div className="mt-2">
                            <Button type="submit" intent="primary" size="sm" aria-label="Create room with selected settings">Create</Button>
                        </div>
                    </form>
                </div>
            </div>

            <NameDialog
                id={DIALOGS.nameCreate}
                confirmLabel="Confirm and create room"
                onConfirm={createRoom}
                setName={setName}
            />
            <NameDialog
                id={DIALOGS.nameJoin}
                confirmLabel="Confirm and join room"
                onConfirm={joinRoom}
                setName={setName}
            />

            <Dialog
                id={DIALOGS.customError}
                title="There was an error with your customization:"
                alert
                actionsAlign="between"
                actions={<DialogClose aria-label="Close error dialog">Cancel</DialogClose>}>
                {/*
                  * The old copy named the mines-under-half rule, which a
                  * player can no longer break -- mines are derived from the
                  * difficulty now. What is left is the dimension range.
                  */}
                <p className="text-pixel-sm">
                    Rows must be between {BOARD_LIMITS.MIN_ROWS} and {BOARD_LIMITS.MAX_ROWS},
                    and columns between {BOARD_LIMITS.MIN_COLS} and {BOARD_LIMITS.MAX_COLS}.
                </p>
            </Dialog>

            <Dialog
                id={DIALOGS.custom}
                title="Customize your Board:"
                onSubmit={customOnSubmit}
                actionsAlign="between"
                actions={
                    <>
                        <Button
                            onClick={cancelCustom}
                            aria-label="Cancel custom board settings">Cancel</Button>
                        <DialogClose
                            intent="success"
                            aria-label="Confirm custom board settings">Confirm</DialogClose>
                    </>
                }>
                <Field
                    label="Number of Rows:"
                    invalid={!!customErrors.rows}
                    errorText={customErrors.rows?.message}
                >
                    <Input
                        type="number"
                        size="sm"
                        defaultValue={numRows}
                        min={BOARD_LIMITS.MIN_ROWS}
                        max={BOARD_LIMITS.MAX_ROWS}
                        invalid={!!customErrors.rows}
                        placeholder={`Between ${BOARD_LIMITS.MIN_ROWS} - ${BOARD_LIMITS.MAX_ROWS}`}
                        aria-label={`Number of rows, between ${BOARD_LIMITS.MIN_ROWS} and ${BOARD_LIMITS.MAX_ROWS}`}
                        aria-required="true"
                        {...customRegister("rows", { required: "Number of Rows is Required." })} />
                </Field>
                <Field
                    label="Number of Columns:"
                    className="mt-4"
                    invalid={!!customErrors.cols}
                    errorText={customErrors.cols?.message}
                >
                    <Input
                        type="number"
                        size="sm"
                        defaultValue={numCols}
                        min={BOARD_LIMITS.MIN_COLS}
                        max={BOARD_LIMITS.MAX_COLS}
                        invalid={!!customErrors.cols}
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
                <p className="mt-4 mb-0 text-pixel-sm" aria-live="polite">
                    {customPreviewValid
                        ? `${difficulty}: ${customPreviewMines} mines`
                        : `${difficulty}: enter dimensions above`}
                </p>
            </Dialog>


        </>
    )
}
