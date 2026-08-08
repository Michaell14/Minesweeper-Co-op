"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useMinesweeperStore } from "@/app/store";
import { Button, CalendarIcon } from "@/components/ds";
import DailyChallenge from "@/components/DailyChallenge";
import DailyDialogs from "@/components/dialogs/DailyDialogs";
import { useGameSession } from "@/hooks/useGameSession";

/**
 * The interactive half of /daily.
 *
 * The attempt is NOT started on mount, deliberately. Arriving here from a search
 * result would otherwise consume the visitor's one attempt for the day before
 * they had decided to play, and it would hand a crawler a grid of empty cells in
 * place of the page's text. The intro (server-rendered, in page.tsx) is what
 * both of them see first; `startDaily` runs on the click.
 *
 * Leaving navigates. `leaveDaily` alone only clears `dailyActive`, which used to
 * be the whole job when the daily was a branch of `/` — it landed the player on
 * Landing. On its own route that same call lands them back on this page's intro,
 * while the button they pressed says "Return to Home". The state still has to be
 * cleared (a stale clock gets recorded as a run), so the push is added to it
 * rather than replacing it.
 */
export default function DailyClient({ intro }: { intro: React.ReactNode }) {
    const { actions } = useGameSession();
    const router = useRouter();
    const dailyActive = useMinesweeperStore((state) => state.dailyActive);

    const leaveDaily = React.useCallback(() => {
        actions.leaveDaily();
        router.push("/");
    }, [actions, router]);

    return (
        <>
            {dailyActive ? (
                <DailyChallenge
                    leaveDaily={leaveDaily}
                    dailyOpenCell={actions.dailyOpenCell}
                    dailyChordCell={actions.dailyChordCell}
                    dailyToggleFlag={actions.dailyToggleFlag}
                    getDailyLeaderboard={actions.getDailyLeaderboard}
                />
            ) : (
                <>
                    {intro}
                    <div className="mx-auto w-full max-w-2xl px-4 pb-12">
                        <Button
                            intent="primary"
                            onClick={actions.startDaily}
                            aria-label="Play today's daily challenge — same board for everyone, ranked by time, one attempt">
                            <span className="flex items-center gap-2">
                                <CalendarIcon size={16} />
                                Play Today&apos;s Puzzle
                            </span>
                        </Button>
                    </div>
                </>
            )}

            <DailyDialogs
                submitDailyScore={actions.submitDailyScore}
                getDailyLeaderboard={actions.getDailyLeaderboard}
            />
        </>
    );
}
