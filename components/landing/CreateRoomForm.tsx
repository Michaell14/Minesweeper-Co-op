"use client";

import React from 'react';
import { useForm } from "react-hook-form";
import { useMinesweeperStore } from '@/app/store';
import { Button, Field, Input, RadioCard, RadioCardGroup } from "@/components/ds";
import { BOARD_SIZES, CUSTOM_SIZE, DIFFICULTY_LEVELS, isValidBoardConfig, mineCountFor } from "@/shared/boardConfig";
import BestForBoard from '@/components/game/BestForBoard';
import { DIALOGS, openDialog } from "@/lib/dialogs";
import { MAX_ROOM_CODE_LENGTH, generateRoomCode } from "@/lib/roomCode";

interface CreateFormValues {
    roomCode: string;
}

export interface CreateRoomFormProps {
    /**
     * Fired instead of the name dialog when the player's name is known. Null
     * (guest) and undefined (account not resolved yet) both mean ask.
     */
    createRoom?: (() => void) | null;
}

/** A radio card's one-line description, sized so four cards on a row stay one line tall. */
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

/** One labeled row of radio cards — Mode, Board Size and Difficulty share it. */
const OptionRow = ({ label, ariaLabel, name, value, onChange, children }: OptionRowProps) => (
    <Field label={label} className="mt-3">
        <RadioCardGroup name={name} value={value} onChange={onChange} ariaLabel={ariaLabel}>
            {children}
        </RadioCardGroup>
    </Field>
);

/**
 * Creating a room: code, then mode, size and difficulty. Submitting records the
 * room and opens the name dialog, which fires `createRoom`; a known name skips
 * the dialog and the action arrives here as a prop.
 */
export default function CreateRoomForm({ createRoom }: CreateRoomFormProps) {
    const numRows = useMinesweeperStore((state) => state.numRows);
    const numCols = useMinesweeperStore((state) => state.numCols);
    const numMines = useMinesweeperStore((state) => state.numMines);
    const boardSize = useMinesweeperStore((state) => state.boardSize);
    const difficulty = useMinesweeperStore((state) => state.difficulty);
    const mode = useMinesweeperStore((state) => state.mode);
    const setBoardSize = useMinesweeperStore((state) => state.setBoardSize);
    const setBoardConfig = useMinesweeperStore((state) => state.setBoardConfig);
    const setMode = useMinesweeperStore((state) => state.setMode);
    const setRoom = useMinesweeperStore((state) => state.setRoom);

    const {
        register,
        handleSubmit,
        setValue,
        setFocus,
        formState: { errors },
    } = useForm<CreateFormValues>();

    /*
     * A suggestion, not a requirement: the field stays editable and `required`.
     * Set in an effect, not as `defaultValue`, because a random value rendered
     * during SSR would differ from the client's and hydration would swap it.
     */
    React.useEffect(() => {
        setValue("roomCode", generateRoomCode());
    }, [setValue]);

    /** A fresh suggestion, into the field and focused so it is obvious what moved. */
    const suggestAnother = React.useCallback(() => {
        setValue("roomCode", generateRoomCode());
        setFocus("roomCode");
    }, [setValue, setFocus]);

    /*
     * The collision dialog lives at the app level and cannot reach this form,
     * so it ticks a counter in the store and this listens.
     */
    const retryNonce = useMinesweeperStore((state) => state.roomCreateNonce);
    const firstNonce = React.useRef(retryNonce);
    React.useEffect(() => {
        if (retryNonce === firstNonce.current) return;
        suggestAnother();
    }, [retryNonce, suggestAnother]);

    /** Mines a difficulty would produce at the current dimensions — the card labels. */
    const minesAt = (difficultyTitle: string) => mineCountFor(numRows, numCols, difficultyTitle);

    const onSubmit = handleSubmit((data) => {
        // Unreachable today; kept so a future path that skips setBoardConfig surfaces here.
        if (!isValidBoardConfig(numRows, numCols, numMines)) {
            openDialog(DIALOGS.customError);
            return;
        }
        // zustand sets synchronously, so the room recorded here is the one `createRoom` emits.
        setRoom(data.roomCode);
        if (createRoom) createRoom();
        else openDialog(DIALOGS.nameCreate);
    });

    const openCustom = () => {
        setBoardSize(CUSTOM_SIZE);
        openDialog(DIALOGS.custom);
    };

    return (
        <>
            <p className="text-pixel-xl">Create a New Room:</p>
            <form onSubmit={onSubmit} className="mt-2" aria-label="Create new room form">
                <Field invalid={!!errors.roomCode} errorText={errors.roomCode?.message}>
                    <div className="flex items-start gap-3">
                        <div className="flex-1">
                            <Input
                                size="sm"
                                maxLength={MAX_ROOM_CODE_LENGTH}
                                type="text"
                                placeholder={"Enter Room Code"}
                                invalid={!!errors.roomCode}
                                aria-label="Room code"
                                aria-required="true"
                                {...register("roomCode", { required: "Room Code is required." })} />
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            className="shrink-0"
                            onClick={suggestAnother}
                            aria-label="Suggest a different room code">
                            New code
                        </Button>
                    </div>
                </Field>

                <OptionRow
                    label={"Select Mode:"}
                    ariaLabel="Select game mode"
                    name="mode"
                    value={mode}
                    onChange={(v) => setMode(v as "co-op" | "pvp")}>
                    <RadioCard label="Co-op" description={<CardNote>One shared board</CardNote>} value="co-op" />
                    <RadioCard label="PvP" description={<CardNote>Race an opponent</CardNote>} value="pvp" />
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
                    {/* Custom opens the dimensions dialog on every click, even when
                        already selected: that is what onSelect is for. */}
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
                    <BestForBoard />
                </div>
            </form>
        </>
    );
}
