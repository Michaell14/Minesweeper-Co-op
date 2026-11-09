"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Field, Input } from "@/components/ds";
import { DIALOGS, openDialog } from "@/lib/dialogs";
import { ROOM_QUERY_PARAM, parseRoomInput } from "@/lib/roomLink";

export interface JoinRoomFormProps {
    /**
     * Fired instead of opening the name dialog when the name is already known.
     * Three states: a function means go straight in, `null` means ask (a
     * guest), `undefined` means the account has not resolved yet. The join-link
     * path decides on MOUNT, so collapsing null and undefined would send every
     * signed-in player arriving by link to a name dialog.
     */
    joinRoom?: (() => void) | null;
}

/** Writes the uncontrolled field, which costs no render. */
const fill = (input: HTMLInputElement | null, value: string) => {
    if (input) input.value = value;
};

/** Compact join form; invite links still jump straight to joining. */
export default function JoinRoomForm({ joinRoom }: JoinRoomFormProps) {
    const setRoom = useMinesweeperStore((state) => state.setRoom);

    /*
     * Uncontrolled: the field is read on submit and rewritten only to show the
     * normalised code, so typing costs no render. No form library: one text
     * field did not justify ~8 kB of the landing page's script.
     */
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [error, setError] = React.useState<string | null>(null);
    // Once a code has been submitted, or rejected, the message tracks each
    // edit, so fixing it clears the error without another press of Join.
    const submitted = React.useRef(false);

    /**
     * A join link (?room=...) pre-fills the code and jumps to the name dialog.
     * The param is stripped right after, so a refresh does not reopen it.
     */
    React.useEffect(() => {
        // Wait for the account before deciding, or a signed-in player is asked
        // for a name that arrives a moment later. The param survives until then.
        if (joinRoom === undefined) return;

        const roomParam = new URLSearchParams(window.location.search).get(ROOM_QUERY_PARAM);
        if (roomParam === null) return;

        const parsed = parseRoomInput(window.location.href);
        if ('error' in parsed) {
            fill(inputRef.current, roomParam);
            setError(parsed.error);
        } else {
            setRoom(parsed.room);
            fill(inputRef.current, parsed.room);
            if (joinRoom) joinRoom();
            else openDialog(DIALOGS.nameJoin);
        }

        const url = new URL(window.location.href);
        url.searchParams.delete(ROOM_QUERY_PARAM);
        window.history.replaceState(null, '', url.toString());
    }, [joinRoom, setRoom]);

    const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!submitted.current && error === null) return;
        const parsed = parseRoomInput(event.target.value);
        setError('error' in parsed ? parsed.error : null);
    };

    const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        submitted.current = true;

        const parsed = parseRoomInput(inputRef.current?.value ?? '');
        if ('error' in parsed) {
            setError(parsed.error);
            inputRef.current?.focus();
            return;
        }

        setError(null);
        // zustand sets synchronously, so the room recorded here is the one `joinRoom` emits.
        setRoom(parsed.room);
        fill(inputRef.current, parsed.room);
        if (joinRoom) joinRoom();
        else openDialog(DIALOGS.nameJoin);
    };

    const invalid = error !== null;

    return (
        <>
            <p className="text-pixel-xs text-ink-muted">Have a room code or invite link?</p>
            <form onSubmit={onSubmit} className="mt-2" aria-label="Join existing room form">
                <div className="flex items-start gap-3">
                    <div className="flex-1">
                        <Field invalid={invalid} errorText={error}>
                            <Input
                                ref={inputRef}
                                name="roomCode"
                                type="text"
                                size="sm"
                                placeholder="Room code or invite link"
                                invalid={invalid}
                                aria-invalid={invalid}
                                aria-label="Room code to join"
                                aria-required="true"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                autoComplete="off"
                                onChange={onChange} />
                        </Field>
                    </div>
                    <Button type="submit" intent="primary" size="sm" className="shrink-0" aria-label="Join room">Join</Button>
                </div>
            </form>
        </>
    );
}
