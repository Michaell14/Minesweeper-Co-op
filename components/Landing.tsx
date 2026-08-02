import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button } from "@/components/ds";
import { DIALOGS } from "@/lib/dialogs";
import AnnouncementBanner from '@/components/landing/AnnouncementBanner';
import JoinRoomForm from '@/components/landing/JoinRoomForm';
import CreateRoomForm from '@/components/landing/CreateRoomForm';
import NameDialog from '@/components/landing/NameDialog';
import CustomBoardDialog from '@/components/landing/CustomBoardDialog';
import CustomBoardErrorDialog from '@/components/landing/CustomBoardErrorDialog';

interface LandingParams {
    createRoom: () => void;
    joinRoom: () => void;
    startDaily: () => void;
}

/**
 * The front page: play today's puzzle, join a room, or create one.
 *
 * Layout and composition only. Each form owns its own `useForm` and its own
 * submit, and each dialog reads what it needs from the store, so nothing here
 * holds state on their behalf — this file used to carry three form hooks, a
 * banner's visibility, a URL effect and five handlers alongside all the markup.
 *
 * The two actions it does drill are `createRoom` and `joinRoom`, and they go
 * straight to the name dialogs. The forms themselves never fire them: a form
 * records the room code and opens a dialog, and the dialog emits once a name is
 * confirmed. That is why the forms take no props at all.
 *
 * The dialogs are mounted here but opened from anywhere via `openDialog` — the
 * board-size card that opens the custom dialog needs no handle on it. See
 * lib/dialogs.ts.
 */
export default function Landing({ createRoom, joinRoom, startDaily }: LandingParams) {
    const setName = useMinesweeperStore((state) => state.setName);

    return (
        <>
            <AnnouncementBanner />

            {/*
              * Tighter than it was (pt-10 lg:pt-20). With three option rows the
              * create form only fits an 800px-tall viewport if the header gives
              * some space back.
              */}
            <div className="text-center pt-4 lg:pt-8">
                <h1 className="text-pixel-2xl md:text-pixel-4xl font-bold">Minesweeper Co-op</h1>
                {/*
                  * The daily challenge is the lowest-friction entry point: no
                  * room code, no name (that's collected on a win, in the
                  * dailySubmit dialog) -- one click straight onto today's
                  * board. A single inline button under the title rather than
                  * its own bordered section, so it reads as a shortcut next to
                  * the game's name, not a second billboard competing with
                  * Join/Create for attention.
                  */}
                <Button
                    intent="primary"
                    size="sm"
                    className="mt-3"
                    onClick={startDaily}
                    aria-label="Play today's daily challenge — same board for everyone, ranked by time, one attempt">
                    🗓️ Play Today&apos;s Puzzle
                </Button>
            </div>

            {/* Chakra <Center pb={12}><Container maxW="2xl"> — 672px is
                max-w-2xl exactly, and the container's own inline padding was
                16px, i.e. px-4. */}
            <div className="flex justify-center pb-12">
                <div className="w-full max-w-2xl mx-auto px-4">
                    <JoinRoomForm />

                    <p className="my-4" id={"horizontal"}>Or</p>

                    <CreateRoomForm />
                </div>
            </div>

            <NameDialog
                id={DIALOGS.nameCreate}
                confirmLabel="Confirm and create room"
                onConfirm={createRoom}
                setName={setName}
            />
            <NameDialog
                id={DIALOGS.nameJoin}
                confirmLabel="Confirm and join room"
                onConfirm={joinRoom}
                setName={setName}
            />

            <CustomBoardErrorDialog />
            <CustomBoardDialog />
        </>
    );
}
