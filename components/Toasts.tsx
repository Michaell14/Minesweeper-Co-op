'use client'
import dynamic from 'next/dynamic';
import { useMinesweeperStore } from '@/app/store';

/*
 * The layout's toasts, fetched the first time one has something to show. They
 * sit on every route but speak rarely, so their code, the whole achievement
 * catalog included, stays out of every page's first load. An empty toast
 * renders nothing, so deferring the mount changes nothing on screen.
 */
const AchievementToast = dynamic(() => import('@/components/AchievementToast'));
const FriendInviteToast = dynamic(() => import('@/components/FriendInviteToast'));

/** Mounted once in the layout, so a toast in flight survives navigation. */
export default function Toasts() {
    const hasUnlocked = useMinesweeperStore((state) => state.unlockedQueue.length > 0);
    const hasInvite = useMinesweeperStore((state) => state.friendInvite !== null);

    return (
        <>
            {hasUnlocked && <AchievementToast />}
            {hasInvite && <FriendInviteToast />}
        </>
    );
}
