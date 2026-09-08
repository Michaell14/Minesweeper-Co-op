"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Field, RadioCard, RadioCardGroup } from "@/components/ds";
import { BOARD_SIZES, CUSTOM_SIZE, DIFFICULTY_LEVELS, isValidBoardConfig, mineCountFor } from "@/shared/boardConfig";
import BestForBoard from '@/components/game/BestForBoard';
import { DIALOGS, openDialog } from "@/lib/dialogs";
import { generateRoomCode } from "@/lib/roomCode";

export interface CreateRoomFormProps {
    /**
     * Fired instead of the name dialog when the player's name is known. Null
     * (guest) and undefined (account not resolved yet) both mean ask.
     */
    createRoom?: (() => void) | null;
    retryCreateRoom?: () => void;
}

/** A radio card's one-line description, sized so four cards on a row stay one line tall. */
const CardNote = ({ children }: { children: React.ReactNode }) => (
    <span className="whitespace-nowrap text-pixel-xs">{children}</span>
);

interface OptionRowProps {
    label?: string;
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

/** Mode, size and difficulty stay visible; extra rules live under Customize. */
export default function CreateRoomForm({ createRoom, retryCreateRoom }: CreateRoomFormProps) {
    const numRows = useMinesweeperStore((state) => state.numRows);
    const numCols = useMinesweeperStore((state) => state.numCols);
    const numMines = useMinesweeperStore((state) => state.numMines);
    const boardSize = useMinesweeperStore((state) => state.boardSize);
    const difficulty = useMinesweeperStore((state) => state.difficulty);
    const relaxed = useMinesweeperStore((state) => state.relaxed);
    const setRelaxed = useMinesweeperStore((state) => state.setRelaxed);
    const mode = useMinesweeperStore((state) => state.mode);
    const setBoardSize = useMinesweeperStore((state) => state.setBoardSize);
    const setBoardConfig = useMinesweeperStore((state) => state.setBoardConfig);
    const setMode = useMinesweeperStore((state) => state.setMode);
    const setRoom = useMinesweeperStore((state) => state.setRoom);

    const [customizing, setCustomizing] = React.useState(false);
    const optionsId = React.useId();
    const retryNonce = useMinesweeperStore((state) => state.roomCreateNonce);
    const lastNonce = React.useRef(retryNonce);
    React.useEffect(() => {
        if (retryNonce === lastNonce.current) return;
        lastNonce.current = retryNonce;
        setRoom(generateRoomCode());
        retryCreateRoom?.();
    }, [retryNonce, retryCreateRoom, setRoom]);

    /** Mines a difficulty would produce at the current dimensions — the card labels. */
    const minesAt = (difficultyTitle: string) => mineCountFor(numRows, numCols, difficultyTitle);

    const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // Unreachable today; kept so a future path that skips setBoardConfig surfaces here.
        if (!isValidBoardConfig(numRows, numCols, numMines)) {
            openDialog(DIALOGS.customError);
            return;
        }
        // zustand sets synchronously, so the room recorded here is the one `createRoom` emits.
        setRoom(generateRoomCode());
        if (createRoom) createRoom();
        else openDialog(DIALOGS.nameCreate);
    };

    const openCustom = () => {
        setBoardSize(CUSTOM_SIZE);
        openDialog(DIALOGS.custom);
    };

    return (
        <>
            <h2 className="text-pixel-lg mt-6">Play with friends</h2>
            <form onSubmit={onSubmit} className="mt-3" aria-label="Create new room form">
                <OptionRow
                    ariaLabel="Select game mode"
                    name="mode"
                    value={mode}
                    onChange={(v) => setMode(v as "co-op" | "pvp")}>
                    <RadioCard label="Co-op" description={<span className="text-pixel-2xs">Solve together</span>} value="co-op" />
                    <RadioCard label="PvP" description={<span className="text-pixel-2xs">Race a friend</span>} value="pvp" />
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

                <p className="text-pixel-xs text-ink-muted mt-4" aria-live="polite">
                    {boardSize === CUSTOM_SIZE ? `${numRows}×${numCols} board` : `${boardSize} board`}
                    {' · '}{difficulty} difficulty
                    {mode === 'co-op' && ` · ${relaxed ? 'Standard · 3 shared lives' : 'Sudden death · 1 shared life'}`}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-4">
                    <Button type="submit" intent="primary" size="sm" aria-label="Create room with selected settings">Create room</Button>
                    <Button type="button" size="sm" aria-expanded={customizing} aria-controls={optionsId}
                        onClick={() => setCustomizing(!customizing)}>
                        {customizing ? 'Done customizing' : 'Customize'}
                    </Button>
                </div>
                <div id={optionsId} hidden={!customizing} className="mt-4">
                    {mode === 'co-op' && (
                        <OptionRow label="Co-op rules:" ariaLabel="Co-op rules" name="coop-rules"
                            value={relaxed ? 'relaxed' : 'classic'} onChange={(value) => setRelaxed(value === 'relaxed')}>
                            <RadioCard label="Standard" value="relaxed" description="Three shared lives" />
                            <RadioCard label="Sudden death" value="classic" description="One mine ends the game" />
                        </OptionRow>
                    )}
                    <BestForBoard />
                </div>
            </form>
        </>
    );
}
