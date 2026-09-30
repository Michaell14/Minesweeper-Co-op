"use client";

import React from 'react';
import { useForm } from "react-hook-form";
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

interface JoinFormValues {
    roomCode: string;
}

/** Compact join form; invite links still jump straight to joining. */
export default function JoinRoomForm({ joinRoom }: JoinRoomFormProps) {
    const setRoom = useMinesweeperStore((state) => state.setRoom);

    const {
        register,
        handleSubmit,
        setValue,
        setError,
        formState: { errors },
    } = useForm<JoinFormValues>();

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
            setValue("roomCode", roomParam);
            setError("roomCode", { type: "validate", message: parsed.error });
        } else {
            setRoom(parsed.room);
            setValue("roomCode", parsed.room);
            if (joinRoom) joinRoom();
            else openDialog(DIALOGS.nameJoin);
        }

        const url = new URL(window.location.href);
        url.searchParams.delete(ROOM_QUERY_PARAM);
        window.history.replaceState(null, '', url.toString());
    }, [joinRoom, setRoom, setValue, setError]);

    const onSubmit = handleSubmit((data) => {
        const parsed = parseRoomInput(data.roomCode);
        if ('error' in parsed) return;
        // zustand sets synchronously, so the room recorded here is the one `joinRoom` emits.
        setRoom(parsed.room);
        setValue("roomCode", parsed.room);
        if (joinRoom) joinRoom();
        else openDialog(DIALOGS.nameJoin);
    });

    return (
        <>
            <p className="text-pixel-xs text-ink-muted">Have a room code or invite link?</p>
            <form onSubmit={onSubmit} className="mt-2" aria-label="Join existing room form">
                <div className="flex items-start gap-3">
                    <div className="flex-1">
                        <Field invalid={!!errors.roomCode} errorText={errors.roomCode?.message}>
                            <Input
                                type="text"
                                size="sm"
                                placeholder="Room code or invite link"
                                invalid={!!errors.roomCode}
                                aria-invalid={!!errors.roomCode}
                                aria-label="Room code to join"
                                aria-required="true"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                autoComplete="off"
                                {...register("roomCode", {
                                    validate: (value) => {
                                        const parsed = parseRoomInput(value);
                                        return 'error' in parsed ? parsed.error : true;
                                    },
                                })} />
                        </Field>
                    </div>
                    <Button type="submit" intent="primary" size="sm" className="shrink-0" aria-label="Join room">Join</Button>
                </div>
            </form>
        </>
    );
}
