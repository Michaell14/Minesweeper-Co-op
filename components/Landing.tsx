import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { useAccountProfile } from '@/hooks/useAccountProfile';
import { Button, ButtonLink, CalendarIcon, Dialog, DialogClose, SwordsIcon } from "@/components/ds";
import { markPlayIntent } from "@/lib/dailyIntent";
import { DIALOGS, openDialog } from "@/lib/dialogs";
import AnnouncementBanner from '@/components/landing/AnnouncementBanner';
import JoinRoomForm from '@/components/landing/JoinRoomForm';
import CreateRoomForm from '@/components/landing/CreateRoomForm';
import JoinPendingIndicator from '@/components/landing/JoinPendingIndicator';
import NameDialog from '@/components/landing/NameDialog';
import MatchSearchingDialog from '@/components/landing/MatchSearchingDialog';
import CustomBoardDialog from '@/components/landing/CustomBoardDialog';
import CustomBoardErrorDialog from '@/components/landing/CustomBoardErrorDialog';

interface LandingParams {
    createRoom: () => void;
    joinRoom: () => void;
    findMatch: () => void;
    cancelMatch: () => void;
    startPracticeRace: () => void;
}

/**
 * The front page: play today's puzzle, join a room, or create one. Layout and
 * composition only. `createRoom`/`joinRoom` go to the name dialogs, not the
 * forms: a form records the room code and opens a dialog, which emits once a
 * name is confirmed. Dialogs are mounted here but opened from anywhere.
 */
export default function Landing({ createRoom, joinRoom, findMatch, cancelMatch, startPracticeRace }: LandingParams) {
    const setName = useMinesweeperStore((state) => state.setName);

    /*
     * A signed-in player never types a name: the server puts the account name
     * on the scoreboard whatever arrives (server/utils/playerIdentity.js).
     */
    const { profile, resolved } = useAccountProfile();
    const accountName = profile?.displayName?.trim() || null;

    /*
     * Seeded into the store: if the handshake's token did not resolve
     * server-side, this is the only name the emit carries. One-way, because
     * clearing on sign-out would wipe a GUEST's typed name.
     */
    React.useEffect(() => {
        if (accountName) setName(accountName);
    }, [accountName, setName]);

    /*
     * What both forms get, derived ONCE: the action if we know the player, null
     * for a guest, undefined while the account loads. `resolved` matters: acting
     * on a not-yet-loaded profile treats every signed-in player as a guest.
     */
    const named = resolved && accountName !== null;
    const skipNameDialog = (action: () => void): (() => void) | null | undefined =>
        resolved ? (named ? action : null) : undefined;

    /*
     * Quick Match is one click and reached before the account resolves, so the
     * click is HELD and replayed once the answer lands.
     */
    const [matchQueued, setMatchQueued] = React.useState(false);

    /** Only correct once `resolved`: before that, `named` means "not yet". */
    const startMatch = React.useCallback(() => {
        if (named) findMatch();
        else openDialog(DIALOGS.nameMatch);
    }, [named, findMatch]);

    // After the setName effect, so the store holds the account name when this fires.
    React.useEffect(() => {
        if (!matchQueued || !resolved) return;
        setMatchQueued(false);
        startMatch();
    }, [matchQueued, resolved, startMatch]);

    return (
        <>
            <AnnouncementBanner />

            {/* Tight: with three option rows the create form only fits 800px if the header gives space back. */}
            <div className="text-center pt-4 lg:pt-8">
                <h1 className="text-pixel-2xl md:text-pixel-4xl font-bold">Minesweeper Co-op</h1>
                {/* Inline shortcuts, not bordered sections, so they do not compete with Join/Create. */}
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {/* A link, not a button: the daily is its own page. The press
                        says "play", never a URL parameter anyone could share to
                        spend a stranger's one attempt (lib/dailyIntent.ts). */}
                    <ButtonLink
                        href="/daily"
                        onClick={markPlayIntent}
                        intent="primary"
                        size="sm"
                        aria-label="Play today's daily challenge — same board for everyone, ranked by time, one attempt">
                        <span className="flex items-center gap-2">
                            <CalendarIcon size={16} />
                            Play Today&apos;s Puzzle
                        </span>
                    </ButtonLink>
                    <Button
                        intent="primary"
                        size="sm"
                        onClick={() => (resolved ? startMatch() : setMatchQueued(true))}
                        disabled={matchQueued}
                        aria-busy={matchQueued}
                        aria-label="Quick match — race a random opponent, no room code needed">
                        <span className="flex items-center gap-2">
                            <SwordsIcon size={16} />
                            Quick Match
                        </span>
                    </Button>
                </div>
            </div>

            <JoinPendingIndicator />

            <div className="flex justify-center pb-12">
                <div className="w-full max-w-2xl mx-auto px-4">
                    <JoinRoomForm joinRoom={skipNameDialog(joinRoom)} />

                    <p className="my-4" id={"horizontal"}>Or</p>

                    <CreateRoomForm createRoom={skipNameDialog(createRoom)} />
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
            <MatchSearchingDialog cancelMatch={cancelMatch} startPracticeRace={startPracticeRace} />

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
