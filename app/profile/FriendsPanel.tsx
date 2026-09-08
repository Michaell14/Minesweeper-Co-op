'use client'
import React from 'react';
import { Button, Field, Input, NameWithAvatar, Panel } from '@/components/ds';
import {
    addFriendByCode,
    fetchFriends,
    removeFriend,
    updateFriendship,
    type FriendAction,
    type FriendGraph,
    type FriendProfile,
} from '@/lib/friendsApi';

/**
 * The friend list, the two request queues, and this account's own code.
 * Fetches its own graph so a friends outage shows here, not as a broken
 * profile. Adding is by CODE, never name search (server/domain/friendCode.js):
 * names are not unique and there are no public profiles.
 */

/** Long enough to read, short enough that a stale answer never confuses. */
const NOTICE_MS = 4000;

export default function FriendsPanel() {
    const [graph, setGraph] = React.useState<FriendGraph | null>(null);
    const [loaded, setLoaded] = React.useState(false);
    const [code, setCode] = React.useState('');
    const [notice, setNotice] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [copied, setCopied] = React.useState(false);

    const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
    React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
    const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

    const load = React.useCallback(async () => {
        const next = await fetchFriends();
        setGraph(next);
        setLoaded(true);
    }, []);

    React.useEffect(() => { void load(); }, [load]);

    const say = (message: string) => {
        setNotice(message);
        later(() => setNotice(''), NOTICE_MS);
    };

    const submitCode = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || code.trim() === '') return;
        setBusy(true);
        const result = await addFriendByCode(code);
        say(result.message);
        // Only reload when something moved; re-fetching after a refused code
        // would make a typo look like it did something.
        if (result.ok) {
            setCode('');
            await load();
        }
        setBusy(false);
    };

    const act = async (person: FriendProfile, action: FriendAction | 'remove') => {
        if (busy) return;
        setBusy(true);
        const moved = action === 'remove'
            ? await removeFriend(person.id)
            : await updateFriendship(person.id, action);
        if (moved) await load();
        else say('That did not work. Try again in a moment.');
        setBusy(false);
    };

    const copyCode = async () => {
        if (!graph?.code) return;
        try {
            await navigator.clipboard.writeText(graph.code);
            setCopied(true);
            later(() => setCopied(false), 2000);
        } catch {
            // Clipboard denied or unavailable — the code is on screen anyway.
        }
    };

    const row = (person: FriendProfile, actions: React.ReactNode) => (
        <li key={person.id} className="flex items-center justify-between gap-3 border-pixel border-edge-muted p-2">
            <NameWithAvatar avatar={person.avatar}>{person.displayName}</NameWithAvatar>
            <span className="flex gap-2 shrink-0">{actions}</span>
        </li>
    );

    const list = (
        heading: string,
        people: FriendProfile[],
        actions: (person: FriendProfile) => React.ReactNode,
    ) => (
        people.length > 0 && (
            <section className="mt-4" aria-label={heading}>
                <p className="text-pixel-sm m-0 mb-2">{heading}</p>
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                    {people.map((person) => row(person, actions(person)))}
                </ul>
            </section>
        )
    );

    return (
        <section aria-labelledby="profile-friends" className="mb-8">
        <Panel title={<span id="profile-friends">Friends</span>}>
            {!loaded && <p className="text-pixel-sm text-ink-muted m-0">Loading…</p>}

            {/* An outage says so: "no friends" and "we cannot tell" are different sentences. */}
            {loaded && !graph && (
                <p className="text-pixel-sm text-ink-muted m-0">
                    Friends are unavailable right now.
                </p>
            )}

            {graph && (
                <>
                    <p className="text-pixel-2xs text-ink-muted m-0 mb-2">
                        Share your code so somebody can add you. Both sides have to agree.
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-pixel-md" aria-label={`Your friend code: ${graph.code ?? 'unavailable'}`}>
                            {graph.code ?? '--------'}
                        </span>
                        <Button
                            size="sm"
                            onClick={copyCode}
                            disabled={!graph.code}
                            aria-label="Copy your friend code to clipboard">
                            {copied ? 'Copied!' : 'Copy code'}
                        </Button>
                    </div>
                    {/* Same reason as RoomPanel: a button is not reliably a live region. */}
                    <span className="sr-only" aria-live="polite">
                        {copied ? 'Friend code copied to clipboard' : ''}
                    </span>

                    <form
                        className="flex items-end gap-2 mt-4 flex-wrap"
                        aria-label="Add a friend by code"
                        onSubmit={submitCode}>
                        {/* Named by aria-label, not Field: Field's caption is a
                            <p> (it captions radio groups), so it labels nothing. */}
                        <Field label="Add by code" className="flex-1">
                            <Input
                                type="text"
                                size="sm"
                                value={code}
                                maxLength={8}
                                placeholder="ABC23XYZ"
                                aria-label="Friend code to add"
                                onChange={(event) => setCode(event.target.value)}
                            />
                        </Field>
                        <Button intent="primary" size="sm" type="submit" disabled={busy}>
                            Add
                        </Button>
                    </form>

                    {/* The answer to an add is what a person is waiting on, so it is announced. */}
                    <p className="text-pixel-2xs text-ink-muted mt-2 mb-0" role="status" aria-live="polite">
                        {notice}
                    </p>

                    {list('Requests', graph.incoming, (person) => (
                        <>
                            <Button size="sm" intent="success" onClick={() => act(person, 'accept')}
                                aria-label={`Accept ${person.displayName}`}>Accept</Button>
                            <Button size="sm" onClick={() => act(person, 'decline')}
                                aria-label={`Decline ${person.displayName}`}>Decline</Button>
                            <Button size="sm" intent="error" onClick={() => act(person, 'block')}
                                aria-label={`Block ${person.displayName}`}>Block</Button>
                        </>
                    ))}

                    {list('Sent', graph.outgoing, (person) => (
                        <Button size="sm" onClick={() => act(person, 'remove')}
                            aria-label={`Cancel your request to ${person.displayName}`}>Cancel</Button>
                    ))}

                    {list('Your friends', graph.friends, (person) => (
                        <Button size="sm" onClick={() => act(person, 'remove')}
                            aria-label={`Remove ${person.displayName}`}>Remove</Button>
                    ))}

                    {/* Mine only; a block placed on me is never listed. Here so
                        it can be lifted. */}
                    {list('Blocked', graph.blocked, (person) => (
                        <Button size="sm" onClick={() => act(person, 'remove')}
                            aria-label={`Unblock ${person.displayName}`}>Unblock</Button>
                    ))}

                    {graph.friends.length === 0 && graph.incoming.length === 0 && graph.outgoing.length === 0 && (
                        <p className="text-pixel-2xs text-ink-muted mt-4 mb-0">
                            Nobody yet. Swap codes with somebody you have played with.
                        </p>
                    )}
                </>
            )}
        </Panel>
        </section>
    );
}
