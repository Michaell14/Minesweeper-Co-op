import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Dialog, DialogClose } from "@/components/ds";
import { DIALOGS, openDialog } from "@/lib/dialogs";
import AnnouncementBanner from '@/components/landing/AnnouncementBanner';
import JoinRoomForm from '@/components/landing/JoinRoomForm';
import CreateRoomForm from '@/components/landing/CreateRoomForm';
import NameDialog from '@/components/landing/NameDialog';
import MatchSearchingDialog from '@/components/landing/MatchSearchingDialog';
import CustomBoardDialog from '@/components/landing/CustomBoardDialog';
import CustomBoardErrorDialog from '@/components/landing/CustomBoardErrorDialog';

interface LandingParams {
    createRoom: () => void;
    joinRoom: () => void;
    startDaily: () => void;
    findMatch: () => void;
    cancelMatch: () => void;
}

/**
 * The front page: play today's puzzle, join a room, or create one.
 *
 * Layout and composition only — each form owns its own state and submit, and
 * each dialog reads what it needs from the store.
 *
 * `createRoom` and `joinRoom` are drilled straight to the name dialogs, never to
 * the forms: a form records the room code and opens a dialog, and the dialog
 * emits once a name is confirmed. That is why the forms take no props.
 *
 * The dialogs are mounted here but opened from anywhere via `openDialog`, so the
 * board-size card needs no handle on the custom dialog.
 */
export default function Landing({ createRoom, joinRoom, startDaily, findMatch, cancelMatch }: LandingParams) {
    const setName = useMinesweeperStore((state) => state.setName);

    return (
        <>
            <AnnouncementBanner />

            {/* Deliberately tight: with three option rows, the create form only
                fits an 800px-tall viewport if the header gives space back. */}
            <div className="text-center pt-4 lg:pt-8">
                <h1 className="text-pixel-2xl md:text-pixel-4xl font-bold">Minesweeper Co-op</h1>
                {/* Inline shortcuts rather than their own bordered sections, so
                    they do not compete with Join/Create for attention. The two
                    sit together because they are the same offer — a game right
                    now, with nothing to fill in and nobody to coordinate with. */}
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <Button
                        intent="primary"
                        size="sm"
                        onClick={startDaily}
                        aria-label="Play today's daily challenge — same board for everyone, ranked by time, one attempt">
                        🗓️ Play Today&apos;s Puzzle
                    </Button>
                    <Button
                        intent="primary"
                        size="sm"
                        onClick={() => openDialog(DIALOGS.nameMatch)}
                        aria-label="Quick match — race a random opponent, no room code needed">
                        ⚔️ Quick Match
                    </Button>
                </div>
            </div>

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

            <NameDialog
                id={DIALOGS.nameMatch}
                confirmLabel="Confirm and find an opponent"
                onConfirm={findMatch}
                setName={setName}
            />
            <MatchSearchingDialog cancelMatch={cancelMatch} />

            <Dialog
                id={DIALOGS.matchError}
                title="Couldn't start a search."
                alert
                actions={<DialogClose aria-label="Close">Close</DialogClose>}>
                <p className="text-pixel-xs text-ink-muted">
                    Try again, or create a room and share the code instead.
                </p>
            </Dialog>

            <CustomBoardErrorDialog />
            <CustomBoardDialog />
        </>
    );
}
