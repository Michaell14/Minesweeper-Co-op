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
     * Fired instead of opening the name dialog, for a player whose name is
     * already known. Null (a guest) and undefined (account not resolved yet)
     * both mean ask — the join form takes the same shape from the same helper,
     * and distinguishes them because its link path fires on mount.
     */
    createRoom?: (() => void) | null;
}

/**
 * A radio card's one-line description. The pixel font is ~14px per glyph, so
 * "48 mines" wraps once four cards share a row; smaller and non-wrapping keeps
 * every card one line tall, which is what makes room for the third option row.
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

/** One labeled row of radio cards — Mode, Board Size and Difficulty share it. */
const OptionRow = ({ label, ariaLabel, name, value, onChange, children }: OptionRowProps) => (
    <Field label={label} className="mt-3">
        <RadioCardGroup name={name} value={value} onChange={onChange} ariaLabel={ariaLabel}>
            {children}
        </RadioCardGroup>
    </Field>
);

/**
 * Creating a room: the code, then mode, size and difficulty. Difficulty's cards
 * show what each density works out to at the size selected above.
 *
 * Submitting records the room and opens the name dialog, and that dialog fires
 * `createRoom` — unless the player's name is already known, in which case the
 * action arrives here as a prop and the dialog is skipped entirely.
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
     * A suggestion, not a requirement — the field stays editable and the form
     * still validates `required`, so clearing it is still an error rather than
     * a silent fall back to the generated one.
     *
     * Generated in an effort rather than as `defaultValue` because the value is
     * random: rendered during SSR it would differ from the client's first
     * render and hydration would swap the field's contents under the cursor.
     */
    React.useEffect(() => {
        setValue("roomCode", generateRoomCode());
    }, [setValue]);

    /**
     * A fresh suggestion, into the field and focused so it is obvious what
     * moved. Also what the collision dialog calls — the store's `roomCreateNonce`
     * ticks when that dialog asks, which is what reaches this component.
     */
    const suggestAnother = React.useCallback(() => {
        setValue("roomCode", generateRoomCode());
        setFocus("roomCode");
    }, [setValue, setFocus]);

    /*
     * The collision dialog lives at the app level (components/dialogs), so it
     * cannot reach this form's state directly. It ticks a counter in the store
     * instead and this is what listens — one number rather than a second copy
     * of the room code that could drift from the field.
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
        // Unreachable today — every path goes through setBoardConfig — but kept
        // so a future writer that skips the derivation surfaces here rather than
        // as a rejected createRoom.
        if (!isValidBoardConfig(numRows, numCols, numMines)) {
            openDialog(DIALOGS.customError);
            return;
        }
        // Both read the store, and zustand sets synchronously, so the room
        // recorded a line above is the one `createRoom` emits.
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
                    {/* Custom is the one card that does more than set a value: it
                        opens the dimensions dialog on every click, including when
                        already selected. That is what onSelect is for. */}
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
