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
 * "Enter your Name", shown before both creating and joining — the two differ
 * only in which action they call. The ref reads the input without the dialog
 * needing to know its own id.
 */
export default function NameDialog({ id, confirmLabel, onConfirm, setName }: NameDialogProps) {
    const inputRef = React.useRef<HTMLInputElement>(null);

    const confirm = (e: React.MouseEvent) => {
        // Trimmed, not merely trim-CHECKED: the surrounding spaces are not part
        // of the name, and storing them put "  Bob  " on the scoreboard while
        // every comment about this path claimed the browser had trimmed it.
        const nameValue = (inputRef.current?.value ?? '').trim();
        if (nameValue.length === 0) {
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
