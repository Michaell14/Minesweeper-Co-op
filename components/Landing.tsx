import React from 'react';
import Link from 'next/link';
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

/** The secondary nav under the two play buttons. Order is by how new a visitor is. */
const SITE_LINKS = [
    { href: '/how-to-play', label: 'How to play' },
    { href: '/drills', label: 'Pattern drills' },
    { href: '/daily', label: 'Daily challenge' },
    { href: '/no-guess-minesweeper', label: 'No-guess boards' },
];

interface LandingParams {
    createRoom: () => void;
    joinRoom: () => void;
    findMatch: () => void;
    cancelMatch: () => void;
    startPracticeRace: () => void;
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
export default function Landing({ createRoom, joinRoom, findMatch, cancelMatch, startPracticeRace }: LandingParams) {
    const setName = useMinesweeperStore((state) => state.setName);

    /*
     * A signed-in player never types a name: they have one, and the server puts
     * it on the scoreboard whatever arrives (server/utils/playerIdentity.js).
     * Asking anyway was friction AND a lie — the typed name lost.
     */
    const { profile, resolved } = useAccountProfile();
    const accountName = profile?.displayName?.trim() || null;

    /*
     * Seeded into the store even though the server prefers its own snapshot.
     * If the client believes it is signed in but the handshake's token did not
     * resolve server-side, this is the only name the emit carries — without it
     * the skip below sends an empty one and the join is refused with nothing
     * on screen to explain it.
     *
     * One-way on purpose: signing out leaves the last account name in the
     * store, which nothing reads, because clearing it here would wipe the name
     * a GUEST typed the moment this resolves as unauthenticated.
     */
    React.useEffect(() => {
        if (accountName) setName(accountName);
    }, [accountName, setName]);

    /*
     * What the two forms get, derived ONCE so they cannot drift: the action if
     * we know the player, null for a guest, and undefined while the account is
     * still loading.
     *
     * `resolved` matters as much as the name. Acting on a not-yet-loaded
     * profile treats every signed-in player as a guest for the first few
     * hundred milliseconds, which is exactly when they click — and the join
     * form's link path decides on MOUNT, when not-yet is the normal state.
     */
    const named = resolved && accountName !== null;
    const skipNameDialog = (action: () => void): (() => void) | null | undefined =>
        resolved ? (named ? action : null) : undefined;

    /*
     * Quick Match is one click, live the instant the page paints, so it is the
     * action people actually reach before the account resolves. Deciding then
     * would ask a signed-in player for a name they already have, so the click
     * is HELD and replayed once the answer lands. The forms fall through to the
     * dialog instead — typing a room code outlasts the fetch — and the one path
     * that does decide on mount, the join link, waits for the same reason.
     */
    const [matchQueued, setMatchQueued] = React.useState(false);

    /** Only correct once `resolved`: before that, `named` means "not yet". */
    const startMatch = React.useCallback(() => {
        if (named) findMatch();
        else openDialog(DIALOGS.nameMatch);
    }, [named, findMatch]);

    // Declared after the setName effect above, so the store already holds the
    // account name when this fires — findMatch drops an emit with an empty one.
    React.useEffect(() => {
        if (!matchQueued || !resolved) return;
        setMatchQueued(false);
        startMatch();
    }, [matchQueued, resolved, startMatch]);

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
                    {/* A link, not a button: the daily is its own page now, and
                        this is how it gets crawled and opened in a new tab.
                        The press is what says "play" — deliberately not a URL
                        parameter, which anyone could share and thereby spend a
                        stranger's one attempt for the day (lib/dailyIntent.ts). */}
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

                {/* The only navigation the app shell has. /drills and
                    /how-to-play were otherwise reachable only from the guide
                    dialog, which sits behind an unlabelled icon in the footer
                    cluster — built pages nobody could find. Deliberately NOT
                    carried onto the game screen: the board is already fighting
                    for vertical space there (components/game/board.module.css). */}
                <nav aria-label="Site" className="mt-3 px-4">
                    {/* Underlined, and separated by more than a space. Nothing
                        in globals.css styles a bare <a>, so without both these
                        four sat in body colour with no gap between them and
                        read as one run of prose rather than four links. */}
                    <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-body-sm">
                        {SITE_LINKS.map(({ href, label }) => (
                            <li key={href}>
                                <Link
                                    href={href}
                                    className="text-ink-muted underline underline-offset-4 hover:text-ink">
                                    {label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
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
