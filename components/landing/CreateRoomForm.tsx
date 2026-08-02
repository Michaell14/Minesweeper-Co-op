"use client";

import React from 'react';
import { useForm } from "react-hook-form";
import { useMinesweeperStore } from '@/app/store';
import { Button, Field, Input, RadioCard, RadioCardGroup } from "@/components/ds";
import { BOARD_SIZES, CUSTOM_SIZE, DIFFICULTY_LEVELS, isValidBoardConfig, mineCountFor } from "@/shared/boardConfig";
import BestForBoard from '@/components/game/BestForBoard';
import { DIALOGS, openDialog } from "@/lib/dialogs";

interface CreateFormValues {
    roomCode: string;
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

/**
 * Creating a room: the code, then mode, size and difficulty.
 *
 * Three option rows, so the cards are `size="sm"` with one-line descriptions.
 * That buys back roughly what the extra row costs. Difficulty's cards show what
 * each density works out to at the size selected above, which is also what
 * keeps them one line.
 *
 * Takes no props for the same reason the join form doesn't: submitting records
 * the room and opens the name dialog, and that dialog fires `createRoom`.
 */
export default function CreateRoomForm() {
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
        formState: { errors },
    } = useForm<CreateFormValues>();

    /** Mines a difficulty would produce at the current dimensions — the card labels. */
    const minesAt = (difficultyTitle: string) => mineCountFor(numRows, numCols, difficultyTitle);

    const onSubmit = handleSubmit((data) => {
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

    const openCustom = () => {
        setBoardSize(CUSTOM_SIZE);
        openDialog(DIALOGS.custom);
    };

    return (
        <>
            <p className="text-pixel-xl">Create a New Room:</p>
            <form onSubmit={onSubmit} className="mt-2" aria-label="Create new room form">
                <Field invalid={!!errors.roomCode} errorText={errors.roomCode?.message}>
                    <Input
                        size="sm"
                        maxLength={28}
                        type="text"
                        placeholder={"Enter Room Code"}
                        invalid={!!errors.roomCode}
                        aria-label="Room code"
                        aria-required="true"
                        {...register("roomCode", { required: "Room Code is required." })} />
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
                    {/*
                      * Custom is the one card that does not just set a value —
                      * it opens the dimensions dialog, every time it is clicked,
                      * including when it is already selected. That is what
                      * onSelect is for.
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
                    <BestForBoard />
                </div>
            </form>
        </>
    );
}
