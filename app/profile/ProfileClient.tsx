'use client'
import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button, Panel, Table } from '@/components/ds';
import { DIALOGS, openDialog } from '@/lib/dialogs';
import { RECENT_WINDOW, fetchStats, importBests, type ProfilePayload } from '@/lib/statsApi';
import { boardLabel, readBestTimes } from '@/lib/bestTimes';
import { formatClock } from '@/lib/gameClock';

/**
 * The private dashboard over what the SERVER recorded — the page has no way
 * to add a game, which is the whole server-authoritative point. The one
 * write it offers is the guest import: this browser's localStorage bests,
 * folded in keep-if-faster.
 */

/** "16x16/40" → the same display name the rest of the app derives. */
const labelForKey = (key: string): string => {
    const match = key.match(/^(\d+)x(\d+)\/(\d+)$/);
    if (!match) return key;
    return boardLabel(Number(match[1]), Number(match[2]), Number(match[3]));
};

const MODE_LABELS = { 'co-op': 'Co-op', pvp: 'PVP', daily: 'Daily' } as const;

const winRate = (wins: number, games: number) =>
    games === 0 ? '—' : `${Math.round((wins / games) * 100)}%`;

const dateOf = (iso: string) => new Date(iso).toLocaleDateString();

export default function ProfileClient() {
    const { status } = useSession();
    const [profile, setProfile] = React.useState<ProfilePayload | null>(null);
    const [state, setState] = React.useState<'loading' | 'ready' | 'unavailable'>('loading');

    const load = React.useCallback(() => {
        setState('loading');
        fetchStats().then((payload) => {
            setProfile(payload);
            setState(payload ? 'ready' : 'unavailable');
        });
    }, []);

    React.useEffect(() => {
        if (status === 'authenticated') load();
    }, [status, load]);

    // The guest import offer: only when this browser actually holds records.
    const [localBestCount, setLocalBestCount] = React.useState(0);
    const [importState, setImportState] = React.useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
    React.useEffect(() => {
        setLocalBestCount(Object.keys(readBestTimes()).length);
    }, []);

    const runImport = async () => {
        setImportState('busy');
        const bests = Object.entries(readBestTimes()).map(([boardKey, best]) => ({
            boardKey,
            seconds: best.seconds,
            players: best.players,
            achievedAt: best.at,
        }));
        const ok = await importBests(bests);
        setImportState(ok ? 'done' : 'failed');
        if (ok) load();
    };

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
                                                <td>{labelForKey(best.boardKey)}</td>
                                                <td>{formatClock(best.seconds)}</td>
                                                <td>{best.players}</td>
                                                <td>{dateOf(best.achievedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            )}
                            {localBestCount > 0 && (
                                <div className="mt-4">
                                    <Button
                                        size="sm"
                                        onClick={() => void runImport()}
                                        disabled={importState === 'busy'}>
                                        {importState === 'busy'
                                            ? 'Importing…'
                                            : `Import this browser's bests (${localBestCount})`}
                                    </Button>
                                    {importState === 'done' && (
                                        <p className="text-pixel-xs text-ink-muted mt-2" role="status">
                                            Imported — kept wherever they were faster.
                                        </p>
                                    )}
                                    {importState === 'failed' && (
                                        <p className="text-pixel-xs mt-2" role="alert">
                                            Import failed — try again in a minute.
                                        </p>
                                    )}
                                </div>
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
                                                    <td>{labelForKey(game.boardKey)}</td>
                                                    <td>{game.won ? 'Won' : 'Lost'}</td>
                                                    <td>
                                                        {game.durationMs === null
                                                            ? '—'
                                                            : formatClock(Math.floor(game.durationMs / 1000))}
                                                    </td>
                                                    <td>{dateOf(game.finishedAt)}</td>
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
        </main>
    );
}
