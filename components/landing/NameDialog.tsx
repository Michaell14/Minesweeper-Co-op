"use client";

import React from 'react';
import { Button, Dialog, DialogClose, Field, Input } from "@/components/ds";
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS, closeDialog } from "@/lib/dialogs";

export interface NameDialogProps {
    id: typeof DIALOGS.nameCreate | typeof DIALOGS.nameJoin | typeof DIALOGS.nameMatch;
    confirmLabel: string;
    onConfirm: () => void;
    setName: (name: string) => void;
}

/**
 * Reuse the name from this visit across creating, joining and quick match,
 * while still allowing the guest to edit it before confirming.
 */
export default function NameDialog({ id, confirmLabel, onConfirm, setName }: NameDialogProps) {
    const name = useMinesweeperStore((state) => state.name);
    const [error, setError] = React.useState('');
    const errorId = `${id}-name-error`;

    const confirm = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        // Trimmed, not merely trim-CHECKED: "  Bob  " once reached the scoreboard.
        const nameValue = name.trim();
        if (nameValue.length === 0) {
            setError('Enter a name to continue.');
            return;
        }
        setName(nameValue);
        setError('');
        closeDialog(id);
        onConfirm();
    };

    return (
        <Dialog
            id={id}
            title="Enter your Name:"
            onSubmit={confirm}
            onClose={() => setError('')}
            actionsAlign="between"
            actions={
                <>
                    <Button
                        aria-label="Cancel and close dialog"
                        onClick={() => closeDialog(id)}>Cancel</Button>
                    <DialogClose
                        intent="success"
                        aria-label={confirmLabel}>Confirm</DialogClose>
                </>
            }>
            <Field invalid={!!error} errorText={error && <span id={errorId}>{error}</span>} className="mb-4">
                <Input
                    type="text"
                    name="name"
                    value={name}
                    maxLength={16}
                    invalid={!!error}
                    aria-invalid={!!error}
                    aria-describedby={error ? errorId : undefined}
                    aria-label="Your player name"
                    aria-required="true"
                    autoComplete="nickname"
                    onChange={(e) => {
                        setError('');
                        setName(e.target.value);
                    }} />
            </Field>
        </Dialog>
    );
}
