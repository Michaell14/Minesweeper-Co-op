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
     * Fired instead of opening the name dialog, for a player whose name is
     * already known.
     *
     * Three states, not two: a function means go straight in, `null` means ask
     * (a guest), and `undefined` means the account has not resolved yet. The
     * join-link path below decides on MOUNT, when not-yet is the normal state,
     * so collapsing null and undefined would send every signed-in player
     * arriving by link to a name dialog they should never see.
     */
    joinRoom?: (() => void) | null;
}

interface JoinFormValues {
    roomCode: string;
}

/**
 * Joining an existing room: one field and a button on one row.
 *
 * Deliberately FIRST on the page — under the create form's three option rows,
 * the Join button fell below the fold on a laptop viewport, and creating is the
 * longer task people will scroll for.
 *
 * The join-link effect lives here because all it does is pre-fill this form's
 * input, which needs this form's `setValue`.
 *
 * Submitting records the room and opens the name dialog, and that dialog fires
 * the `joinRoom` emit — unless the player's name is already known, in which
 * case the action arrives here as a prop and the dialog is skipped entirely.
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
     * A join link (?room=...) pre-fills the code and jumps straight to the name
     * dialog. The param is stripped right after, so a refresh or a return to the
     * landing page does not reopen it.
     */
    React.useEffect(() => {
        // Wait for the account before deciding: acting now would ask a
        // signed-in player for a name that arrives a moment later. The param
        // survives until then, and is stripped by the run that acts.
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
        // Both read the store, and zustand sets synchronously, so the room
        // recorded a line above is the one `joinRoom` emits.
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
