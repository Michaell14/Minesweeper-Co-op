import React from 'react';
import { HStack, Center } from "@chakra-ui/react";
import { useForm } from "react-hook-form";
import { Field } from "@/components/ui/field";
import { useMinesweeperStore } from '@/app/store';
import {
    RadioCardItem,
    RadioCardRoot,
} from "@/components/ui/radio-card";
import { difficultyConfig } from "@/lib/difficultyConfig";
import "nes.css/css/nes.min.css";

interface FormValues {
    roomCode: string
}

interface LandingParams {
    createRoom: () => void;
    joinRoom: () => void;
}


export default function Landing({ createRoom, joinRoom }: LandingParams) {

    const { difficulty, setDimensions, setRoom, setName } = useMinesweeperStore();
    const {
        register: createRegister,
        handleSubmit: handleCreateSubmit,
        formState: { errors: createErrors },
    } = useForm<FormValues>()

    const {
        register: joinRegister,
        handleSubmit: handleJoinSubmit,
        formState: { errors: joinErrors },
    } = useForm<FormValues>()

    const createOnSubmit = handleCreateSubmit((data) => {
        setRoom(data.roomCode);
        (document.getElementById('dialog-name-create') as HTMLDialogElement)?.showModal();
    });
    // const createOnSubmit = handleCreateSubmit((data) => setRoom(data.roomCode) createRoom(data.roomCode));
    // 
    // const joinOnSubmit = handleJoinSubmit((data) => joinRoom(data.roomCode));
    const joinOnSubmit = handleJoinSubmit((data) => {
        setRoom(data.roomCode);
        (document.getElementById('dialog-name-join') as HTMLDialogElement)?.showModal();
    });


    return (
        <>
            <div className="text-center mt-20">
                <p className="text-red-800 text-5xl font-bold">Minesweeper Co-op</p>
            </div>
            <Center>

                <HStack gap={36} maxW={"75vw"}>
                    <div>
                        <p className="text-xl mt-10">Create a New Room:</p>

                        <form onSubmit={createOnSubmit} className="mt-2">
                            <Field
                                invalid={!!createErrors.roomCode}
                                errorText={createErrors.roomCode?.message}
                            >

                                <input className="nes-input text-xs" type="text" placeholder={"Enter Room Code"}
                                    {...createRegister("roomCode", { required: "Room Code is required" })} />
                            </Field>
                            <Field label={"Select Difficulty:"} mt={5}>
                                <RadioCardRoot variant={"subtle"} defaultValue={difficulty}>
                                    <HStack align="stretch" >
                                        {difficultyConfig.map((item) => (
                                            <RadioCardItem
                                                onClick={() => { setDimensions(item.rows, item.cols, item.mines, item.title) }}
                                                label={item.title}
                                                description={`${item.rows}x${item.cols}, ${item.mines} mines`}
                                                key={item.title}
                                                value={item.title}
                                            />
                                        ))}
                                    </HStack>
                                </RadioCardRoot>
                            </Field>
                            <div className="mt-2">
                                <button type="submit" className="nes-btn is-primary text-xs">Create</button>
                            </div>
                        </form>
                        <p className="my-5" id={"horizontal"}>Or</p>
                        <p className="text-xl">Join an Existing Room:</p>
                        <form onSubmit={joinOnSubmit} className="mt-2">
                            <Field
                                invalid={!!joinErrors.roomCode}
                                errorText={joinErrors.roomCode?.message}
                            >

                                <input type="text" placeholder={"Enter Room Code"} className="nes-input text-xs"
                                    {...joinRegister("roomCode", { required: "Room Code is required" })} />
                            </Field>
                            <div className="mt-4">
                                <button type="submit" className="nes-btn is-primary text-xs">Join</button>
                            </div>
                        </form>
                    </div>
                    <div className="my-10">
                        <div className="nes-container is-rounded">
                            <p>Guide:</p>
                            <p>1) Create a room code (Can be anything you want)</p>
                            <p>2) Share your room code with friends</p>
                            <p>3) Play together!</p>
                        </div>
                    </div>
                </HStack>
            </Center>
            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-name-create">
                <form method="dialog">
                    <p>Enter your Name:</p>
                    <div className="nes-field mb-4">
                        <input type="text" className="nes-input text-sm" onChange={(e) => setName(e.target.value)}/>
                    </div>
                    <div className="flex justify-between">
                        <button className="nes-btn">Cancel</button>
                        <button onClick={createRoom} type={"submit"} className="nes-btn is-success">Confirm</button>
                    </div>
                </form>
            </dialog>
            <dialog className="nes-dialog absolute left-1/2 top-60 -translate-x-1/2" id="dialog-name-join">
                <form method="dialog">
                    <p>Enter your Name:</p>
                    <div className="nes-field mb-4">
                        <input type="text" className="nes-input text-sm" onChange={(e) => setName(e.target.value)}/>
                    </div>
                    <div className="flex justify-between">
                        <button className="nes-btn">Cancel</button>
                        <button onClick={joinRoom} className="nes-btn is-success">Confirm</button>
                    </div>
                </form>
            </dialog>
        </>
    )
}
