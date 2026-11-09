"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Dialog, DialogClose, Field, Input } from "@/components/ds";
import { BOARD_LIMITS, CUSTOM_SIZE, isValidBoardConfig, mineCountFor } from "@/shared/boardConfig";
import { DIALOGS, closeDialog, openDialog } from "@/lib/dialogs";

/** No mine count: difficulty supplies the density, so mines are derived. */
type Dimension = 'rows' | 'cols';

/** As typed: a number input reads '' while it is empty or mid-edit. */
type Draft = Record<Dimension, string>;

const REQUIRED: Record<Dimension, string> = {
    rows: 'Number of Rows is Required.',
    cols: 'Number of Columns is Required.',
};

const requiredError = (field: Dimension, value: string) => (value === '' ? REQUIRED[field] : undefined);

/**
 * Hand-rolled board dimensions. Reads the store and writes back through
 * `setBoardConfig`; opened imperatively, so it takes no props.
 */
export default function CustomBoardDialog() {
    const numRows = useMinesweeperStore((state) => state.numRows);
    const numCols = useMinesweeperStore((state) => state.numCols);
    const difficulty = useMinesweeperStore((state) => state.difficulty);
    const setBoardConfig = useMinesweeperStore((state) => state.setBoardConfig);

    // Uncontrolled fields: the draft below mirrors them for the live count.
    const rowsRef = React.useRef<HTMLInputElement>(null);
    const colsRef = React.useRef<HTMLInputElement>(null);
    const [draft, setDraft] = React.useState<Draft>(() => ({ rows: String(numRows), cols: String(numCols) }));
    const [errors, setErrors] = React.useState<Partial<Record<Dimension, string>>>({});
    // After a submit, a field re-checks as it is edited, so a fix clears its message.
    const submitted = React.useRef(false);

    // Each opening starts a fresh draft. Merely opening or dismissing the
    // dialog must not change the board the player already selected.
    React.useEffect(() => {
        const dialog = document.getElementById(DIALOGS.custom) as HTMLDialogElement | null;
        const onToggle = () => {
            if (!dialog?.open) return;
            const { numRows: rows, numCols: cols } = useMinesweeperStore.getState();
            const fresh = { rows: String(rows), cols: String(cols) };
            if (rowsRef.current) rowsRef.current.value = fresh.rows;
            if (colsRef.current) colsRef.current.value = fresh.cols;
            setDraft(fresh);
            setErrors({});
            submitted.current = false;
        };
        dialog?.addEventListener('toggle', onToggle);
        return () => dialog?.removeEventListener('toggle', onToggle);
    }, []);

    const onEdit = (field: Dimension) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setDraft((current) => ({ ...current, [field]: value }));
        if (submitted.current) setErrors((current) => ({ ...current, [field]: requiredError(field, value) }));
    };

    // The count updates as you type: the only feedback that mines are derived.
    const previewRows = Number(draft.rows);
    const previewCols = Number(draft.cols);
    const previewMines = mineCountFor(previewRows, previewCols, difficulty);
    const previewValid = isValidBoardConfig(previewRows, previewCols, previewMines);

    const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        // Validation decides whether the dialog closes, so the native
        // method="dialog" submit must not close it first.
        event.preventDefault();
        submitted.current = true;

        const values: Draft = { rows: rowsRef.current?.value ?? '', cols: colsRef.current?.value ?? '' };
        const found = { rows: requiredError('rows', values.rows), cols: requiredError('cols', values.cols) };
        setErrors(found);
        if (found.rows || found.cols) {
            (found.rows ? rowsRef : colsRef).current?.focus();
            return;
        }

        const rows = Number(values.rows);
        const cols = Number(values.cols);

        // The same check the server runs, so a board it would reject cannot be accepted here.
        if (!isValidBoardConfig(rows, cols, mineCountFor(rows, cols, difficulty))) {
            openDialog(DIALOGS.customError);
            return;
        }

        setBoardConfig(CUSTOM_SIZE, difficulty, { rows, cols });
        closeDialog(DIALOGS.custom);
    };

    const cancel = () => {
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
            <Field label="Number of Rows:" invalid={!!errors.rows} errorText={errors.rows}>
                <Input
                    ref={rowsRef}
                    name="rows"
                    type="number"
                    size="sm"
                    defaultValue={numRows}
                    min={BOARD_LIMITS.MIN_ROWS}
                    max={BOARD_LIMITS.MAX_ROWS}
                    invalid={!!errors.rows}
                    placeholder={`Between ${BOARD_LIMITS.MIN_ROWS} - ${BOARD_LIMITS.MAX_ROWS}`}
                    aria-label={`Number of rows, between ${BOARD_LIMITS.MIN_ROWS} and ${BOARD_LIMITS.MAX_ROWS}`}
                    aria-required="true"
                    onChange={onEdit('rows')} />
            </Field>
            <Field
                label="Number of Columns:"
                className="mt-4"
                invalid={!!errors.cols}
                errorText={errors.cols}>
                <Input
                    ref={colsRef}
                    name="cols"
                    type="number"
                    size="sm"
                    defaultValue={numCols}
                    min={BOARD_LIMITS.MIN_COLS}
                    max={BOARD_LIMITS.MAX_COLS}
                    invalid={!!errors.cols}
                    placeholder={`Between ${BOARD_LIMITS.MIN_COLS} - ${BOARD_LIMITS.MAX_COLS}`}
                    aria-label={`Number of columns, between ${BOARD_LIMITS.MIN_COLS} and ${BOARD_LIMITS.MAX_COLS}`}
                    aria-required="true"
                    onChange={onEdit('cols')} />
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
