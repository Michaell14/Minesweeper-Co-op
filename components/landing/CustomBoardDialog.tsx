"use client";

import React from 'react';
import { useForm } from "react-hook-form";
import { useMinesweeperStore } from '@/app/store';
import { Button, Dialog, DialogClose, Field, Input } from "@/components/ds";
import { BOARD_LIMITS, CUSTOM_SIZE, DEFAULT_SIZE, isValidBoardConfig, mineCountFor } from "@/shared/boardConfig";
import { DIALOGS, closeDialog, openDialog } from "@/lib/dialogs";

/** No mine count: difficulty supplies the density, so mines are derived. */
interface CustomFormValues {
    rows: number;
    cols: number;
}

/**
 * Hand-rolled board dimensions. Reads the store and writes back through
 * `setBoardConfig`; opened imperatively, so it takes no props.
 */
export default function CustomBoardDialog() {
    const numRows = useMinesweeperStore((state) => state.numRows);
    const numCols = useMinesweeperStore((state) => state.numCols);
    const difficulty = useMinesweeperStore((state) => state.difficulty);
    const setBoardConfig = useMinesweeperStore((state) => state.setBoardConfig);

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<CustomFormValues>();

    // Watched so the count updates as you type, the only feedback that mines are derived.
    const previewRows = Number(watch("rows"));
    const previewCols = Number(watch("cols"));
    const previewMines = mineCountFor(previewRows, previewCols, difficulty);
    const previewValid = isValidBoardConfig(previewRows, previewCols, previewMines);

    const onSubmit = handleSubmit((data) => {
        const rows = parseInt(data.rows.toString());
        const cols = parseInt(data.cols.toString());

        // The same check the server runs, so a board it would reject cannot be accepted here.
        if (!isValidBoardConfig(rows, cols, mineCountFor(rows, cols, difficulty))) {
            openDialog(DIALOGS.customError);
            return;
        }

        setBoardConfig(CUSTOM_SIZE, difficulty, { rows, cols });
        closeDialog(DIALOGS.custom);
    });

    const cancel = () => {
        // Back to the default SIZE, keeping the difficulty: the two are independent.
        setBoardConfig(DEFAULT_SIZE, difficulty);
        closeDialog(DIALOGS.custom);
    };

    return (
        <Dialog
            id={DIALOGS.custom}
            title="Customize your Board:"
            onSubmit={onSubmit}
            actionsAlign="between"
            actions={
                <>
                    <Button onClick={cancel} aria-label="Cancel custom board settings">Cancel</Button>
                    <DialogClose intent="success" aria-label="Confirm custom board settings">Confirm</DialogClose>
                </>
            }>
            <Field label="Number of Rows:" invalid={!!errors.rows} errorText={errors.rows?.message}>
                <Input
                    type="number"
                    size="sm"
                    defaultValue={numRows}
                    min={BOARD_LIMITS.MIN_ROWS}
                    max={BOARD_LIMITS.MAX_ROWS}
                    invalid={!!errors.rows}
                    placeholder={`Between ${BOARD_LIMITS.MIN_ROWS} - ${BOARD_LIMITS.MAX_ROWS}`}
                    aria-label={`Number of rows, between ${BOARD_LIMITS.MIN_ROWS} and ${BOARD_LIMITS.MAX_ROWS}`}
                    aria-required="true"
                    {...register("rows", { required: "Number of Rows is Required." })} />
            </Field>
            <Field
                label="Number of Columns:"
                className="mt-4"
                invalid={!!errors.cols}
                errorText={errors.cols?.message}>
                <Input
                    type="number"
                    size="sm"
                    defaultValue={numCols}
                    min={BOARD_LIMITS.MIN_COLS}
                    max={BOARD_LIMITS.MAX_COLS}
                    invalid={!!errors.cols}
                    placeholder={`Between ${BOARD_LIMITS.MIN_COLS} - ${BOARD_LIMITS.MAX_COLS}`}
                    aria-label={`Number of columns, between ${BOARD_LIMITS.MIN_COLS} and ${BOARD_LIMITS.MAX_COLS}`}
                    aria-required="true"
                    {...register("cols", { required: "Number of Columns is Required." })} />
            </Field>
            {/* No mine field: difficulty owns the density, and the live count is what makes that legible. */}
            <p className="mt-4 mb-0 text-pixel-sm" aria-live="polite">
                {previewValid
                    ? `${difficulty}: ${previewMines} mines`
                    : `${difficulty}: enter dimensions above`}
            </p>
        </Dialog>
    );
}
