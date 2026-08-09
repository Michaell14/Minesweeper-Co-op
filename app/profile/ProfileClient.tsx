'use client'
import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button, Panel, Table } from '@/components/ds';
import { DIALOGS, openDialog } from '@/lib/dialogs';
import { RECENT_WINDOW, fetchStats, type ProfilePayload } from '@/lib/statsApi';
import { labelForBestKey } from '@/lib/bestTimes';
import { formatClock } from '@/lib/gameClock';
import { formatDate } from '@/lib/formatDate';
import { markAchievementsSeen, newlyEarned } from '@/lib/achievementsSeen';
import AccountPanel from './AccountPanel';
import AchievementsPanel from './AchievementsPanel';
import DailyHistoryPanel from './DailyHistoryPanel';

/**
 * The private dashboard over what the SERVER recorded — the page has no way
 * to add a game, which is the whole server-authoritative point. This
 * browser's localStorage bests need no import button: SettingsSync merges
 * them with the account, keep-if-faster both ways, on every signed-in load.
 */

const MODE_LABELS = { 'co-op': 'Co-op', pvp: 'PVP', daily: 'Daily' } as const;

const winRate = (wins: number, games: number) =>
    games === 0 ? '—' : `${Math.round((wins / games) * 100)}%`;

export default function ProfileClient() {
    const { status } = useSession();
    const [profile, setProfile] = React.useState<ProfilePayload | null>(null);
    const [state, setState] = React.useState<'loading' | 'ready' | 'unavailable'>('loading');

    /*
     * Which achievements are new since this browser last looked. Captured at
     * load and held in state, then the watermark advances immediately: reading
     * it during render instead would clear the badges on the first re-render,
     * before anyone had a chance to see them.
     *
     * Once per VISIT, not once per fetch. `load` runs again from the Retry
     * button, and a second pass would compare against the watermark it just
     * wrote and blank the badges while the player was still reading them.
     */
    const [freshAchievements, setFreshAchievements] = React.useState<Set<string>>(new Set());
    const seenMarked = React.useRef(false);

    const load = React.useCallback(() => {
        setState('loading');
        fetchStats().then((payload) => {
            setProfile(payload);
            setState(payload ? 'ready' : 'unavailable');
            if (payload && !seenMarked.current) {
                seenMarked.current = true;
                const earned = payload.achievements ?? [];
                setFreshAchievements(newlyEarned(earned));
                markAchievementsSeen(earned);
            }
        });
    }, []);

    React.useEffect(() => {
        if (status === 'authenticated') load();
    }, [status, load]);

    return (
        <main className="max-w-3xl mx-auto px-6 pt-10 pb-24">
            <div className="flex items-baseline justify-between flex-wrap gap-4 mb-8">
                <h1 className="text-pixel-2xl">Profile</h1>
                <Link href="/" className="text-pixel-sm underline">
                    Back to the game
                </Link>
            </div>

            {status === 'loading' && <p className="text-pixel-sm text-ink-muted">Loading…</p>}

            {status === 'unauthenticated' && (
                <Panel title="Sign in">
                    <p className="text-pixel-sm">
                        Your profile is your own private record of every game the server
                        saw you finish. Sign in and it starts counting.
                    </p>
                    <Button size="sm" className="mt-4" onClick={() => openDialog(DIALOGS.account)}>
                        Sign in
                    </Button>
                </Panel>
            )}

            {status === 'authenticated' && state === 'loading' && (
                <p className="text-pixel-sm text-ink-muted">Loading your stats…</p>
            )}

            {status === 'authenticated' && state === 'unavailable' && (
                <Panel title="Unavailable">
                    <p className="text-pixel-sm">
                        Your stats could not be loaded right now. Games still count —
                        try again in a minute.
                    </p>
                    <Button size="sm" className="mt-4" onClick={load}>Retry</Button>
                </Panel>
            )}

            {status === 'authenticated' && state === 'ready' && profile && (
                <>
                    <section aria-labelledby="profile-overview" className="mb-8">
                        <Panel title={<span id="profile-overview">Overview</span>}>
                            <Table aria-label="Games and wins by mode">
                                <thead>
                                    <tr><th>Mode</th><th>Games</th><th>Wins</th><th>Win rate</th></tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>Co-op</td>
                                        <td>{profile.stats.coopGames}</td>
                                        <td>{profile.stats.coopWins}</td>
                                        <td>{winRate(profile.stats.coopWins, profile.stats.coopGames)}</td>
                                    </tr>
                                    <tr>
                                        <td>PVP</td>
                                        <td>{profile.stats.pvpGames}</td>
                                        <td>{profile.stats.pvpWins}</td>
                                        <td>{winRate(profile.stats.pvpWins, profile.stats.pvpGames)}</td>
                                    </tr>
                                    <tr>
                                        <td>Daily</td>
                                        <td>{profile.stats.dailyGames}</td>
                                        <td>{profile.stats.dailyWins}</td>
                                        <td>{winRate(profile.stats.dailyWins, profile.stats.dailyGames)}</td>
                                    </tr>
                                </tbody>
                            </Table>
                            <p className="text-pixel-sm mt-4" role="status" aria-label="Play streak">
                                🔥 Streak: <strong>{profile.stats.currentStreak}</strong> day
                                {profile.stats.currentStreak === 1 ? '' : 's'} (best{' '}
                                {profile.stats.bestStreak})
                            </p>
                        </Panel>
                    </section>

                    <AchievementsPanel
                        achievements={profile.achievements ?? []}
                        stats={profile.stats}
                        highlighted={freshAchievements}
                    />

                    {/* The ?? fallbacks cover a backend that briefly predates
                        these payload fields — the two halves deploy from the
                        same trunk but never land atomically. */}
                    <DailyHistoryPanel
                        history={profile.dailyHistory ?? []}
                        dailyCurrentStreak={profile.stats.dailyCurrentStreak ?? 0}
                        dailyBestStreak={profile.stats.dailyBestStreak ?? 0}
                        lastDailyDay={profile.stats.lastDailyDay ?? null}
                    />

                    <section aria-labelledby="profile-bests" className="mb-8">
                        <Panel title={<span id="profile-bests">Best times</span>}>
                            {profile.boardBests.length === 0 ? (
                                <p className="text-pixel-sm text-ink-muted">
                                    No cleared boards recorded yet — finish one signed in and
                                    it lands here.
                                </p>
                            ) : (
                                <Table aria-label="Best time per board">
                                    <thead>
                                        <tr><th>Board</th><th>Time</th><th>Players</th><th>When</th></tr>
                                    </thead>
                                    <tbody>
                                        {profile.boardBests.map((best) => (
                                            <tr key={best.boardKey}>
                                                <td>{labelForBestKey(best.boardKey)}</td>
                                                <td>{formatClock(best.seconds)}</td>
                                                <td>{best.players}</td>
                                                <td>{formatDate(best.achievedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            )}
                        </Panel>
                    </section>

                    <section aria-labelledby="profile-recent">
                        <Panel title={<span id="profile-recent">Recent games</span>}>
                            {profile.recentGames.length === 0 ? (
                                <p className="text-pixel-sm text-ink-muted">
                                    Nothing yet — this fills with your last{' '}
                                    {RECENT_WINDOW} finished games.
                                </p>
                            ) : (
                                <>
                                    {/* The trend, at a glance: newest first. */}
                                    <p
                                        className="text-pixel-sm tracking-widest mb-3"
                                        aria-label={`Last ${profile.recentGames.length} games, newest first`}>
                                        {profile.recentGames.map((game, i) => (
                                            <span key={i} aria-hidden="true">
                                                {game.won ? '🟩' : '🟥'}
                                            </span>
                                        ))}
                                    </p>
                                    <Table aria-label="Recent games">
                                        <thead>
                                            <tr><th>Mode</th><th>Board</th><th>Result</th><th>Time</th><th>When</th></tr>
                                        </thead>
                                        <tbody>
                                            {profile.recentGames.map((game, i) => (
                                                <tr key={i}>
                                                    <td>{MODE_LABELS[game.mode] ?? game.mode}</td>
                                                    <td>{labelForBestKey(game.boardKey)}</td>
                                                    <td>{game.won ? 'Won' : 'Lost'}</td>
                                                    <td>
                                                        {game.durationMs === null
                                                            ? '—'
                                                            : formatClock(Math.floor(game.durationMs / 1000))}
                                                    </td>
                                                    <td>{formatDate(game.finishedAt)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                </>
                            )}
                        </Panel>
                    </section>
                </>
            )}

            {/* Account management follows the stats — and renders even when the
                stats are unavailable, because sign-out must stay reachable. */}
            {status === 'authenticated' && <AccountPanel />}
        </main>
    );
}
