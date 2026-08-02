"use client";

import React from 'react';
import { useForm } from "react-hook-form";
import { useMinesweeperStore } from '@/app/store';
import { Button, Field, Input } from "@/components/ds";
import { DIALOGS, openDialog } from "@/lib/dialogs";
import { ROOM_QUERY_PARAM } from "@/lib/roomLink";

interface JoinFormValues {
    roomCode: string;
}

/**
 * Joining an existing room: one field and a button on one row.
 *
 * This comes FIRST on the page. Joining is a single field, but it used to sit
 * under the whole create form — with mode, size and difficulty above it, the
 * Join button fell below the fold on a normal laptop viewport. Creating a room
 * is the longer task and the one people scroll for.
 *
 * The join-link effect lives here rather than in the parent because the only
 * thing it does is pre-fill this form's input, which means it needs this form's
 * `setValue`. Keeping them together is what stops that handle being passed up.
 *
 * Takes no props. Submitting only records the room and opens the name dialog;
 * the actual `joinRoom` emit is fired by that dialog, so this form never needs
 * a handle on it.
 */
export default function JoinRoomForm() {
    const setRoom = useMinesweeperStore((state) => state.setRoom);

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<JoinFormValues>();

    /**
     * A join link (?room=...) pre-fills the room code and jumps straight to the
     * name dialog, skipping the "type the code in yourself" step. The param is
     * stripped from the URL right after so a refresh or leaving-and-returning
     * doesn't reopen the dialog.
     */
    React.useEffect(() => {
        const roomParam = new URLSearchParams(window.location.search).get(ROOM_QUERY_PARAM)?.trim().slice(0, 200);
        if (!roomParam) return;

        setRoom(roomParam);
        setValue("roomCode", roomParam);
        openDialog(DIALOGS.nameJoin);

        const url = new URL(window.location.href);
        url.searchParams.delete(ROOM_QUERY_PARAM);
        window.history.replaceState(null, '', url.toString());
    }, [setRoom, setValue]);

    const onSubmit = handleSubmit((data) => {
        setRoom(data.roomCode);
        openDialog(DIALOGS.nameJoin);
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
                                maxLength={28}
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
