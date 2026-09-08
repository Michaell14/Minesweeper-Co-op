"use client";

import React from 'react';
import { useForm } from "react-hook-form";
import { useMinesweeperStore } from '@/app/store';
import { Button, Field, Input } from "@/components/ds";
import { DIALOGS, openDialog } from "@/lib/dialogs";
import { ROOM_QUERY_PARAM } from "@/lib/roomLink";
import { MAX_ROOM_CODE_LENGTH } from "@/lib/roomCode";

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

/**
 * Joining an existing room: one field and a button on one row. FIRST on the
 * page, since under the create form's option rows the Join button fell below
 * the fold on a laptop. The join-link effect lives here because it pre-fills
 * this form's input. Submitting records the room and opens the name dialog,
 * which fires the `joinRoom` emit; a known name skips the dialog.
 */
export default function JoinRoomForm({ joinRoom }: JoinRoomFormProps) {
    const setRoom = useMinesweeperStore((state) => state.setRoom);

    const {
        register,
        handleSubmit,
        setValue,
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

        const roomParam = new URLSearchParams(window.location.search).get(ROOM_QUERY_PARAM)?.trim().slice(0, 200);
        if (!roomParam) return;

        setRoom(roomParam);
        setValue("roomCode", roomParam);
        if (joinRoom) joinRoom();
        else openDialog(DIALOGS.nameJoin);

        const url = new URL(window.location.href);
        url.searchParams.delete(ROOM_QUERY_PARAM);
        window.history.replaceState(null, '', url.toString());
    }, [joinRoom, setRoom, setValue]);

    const onSubmit = handleSubmit((data) => {
        // zustand sets synchronously, so the room recorded here is the one `joinRoom` emits.
        setRoom(data.roomCode);
        if (joinRoom) joinRoom();
        else openDialog(DIALOGS.nameJoin);
    });

    return (
        <>
            <p className="text-pixel-xl mt-6">Join an Existing Room:</p>
            <form onSubmit={onSubmit} className="mt-2" aria-label="Join existing room form">
                <div className="flex items-start gap-3">
                    <div className="flex-1">
                        <Field invalid={!!errors.roomCode} errorText={errors.roomCode?.message}>
                            <Input
                                type="text"
                                size="sm"
                                maxLength={MAX_ROOM_CODE_LENGTH}
                                placeholder={"Enter Room Code"}
                                invalid={!!errors.roomCode}
                                aria-label="Room code to join"
                                aria-required="true"
                                {...register("roomCode", { required: "Room Code is required." })} />
                        </Field>
                    </div>
                    <Button type="submit" intent="primary" size="sm" className="shrink-0" aria-label="Join room">Join</Button>
                </div>
            </form>
        </>
    );
}
