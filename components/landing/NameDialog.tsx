"use client";

import React from 'react';
import { Button, Dialog, DialogClose, Input } from "@/components/ds";
import { DIALOGS, closeDialog } from "@/lib/dialogs";

export interface NameDialogProps {
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
export default function NameDialog({ id, confirmLabel, onConfirm, setName }: NameDialogProps) {
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
}
