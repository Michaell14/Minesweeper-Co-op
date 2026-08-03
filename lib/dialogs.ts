/**
 * Every dialog in the app, and the two ways to drive one.
 *
 * These are native <dialog> elements — `form method="dialog"` gives the buttons
 * their close-on-submit behaviour — so they are opened imperatively rather than
 * by React state. Import an id from here rather than typing the literal.
 */

export const DIALOGS = {
    // Owned by app/page.tsx (see components/dialogs/GameDialogs.tsx)
    gameSummary: 'dialog-game-summary',
    createRoomError: 'dialog-create-room-error',
    joinRoomError: 'dialog-join-room-error',
    roomDoesNotExist: 'dialog-room-does-not-exist-error',
    pvpRoomFull: 'dialog-pvp-room-full',
    pvpGameOver: 'dialog-pvp-game-over',
    pvpYouWon: 'dialog-pvp-you-won',
    pvpOpponentWon: 'dialog-pvp-opponent-won',
    pvpOpponentDisconnected: 'dialog-pvp-opponent-disconnected',

    // Owned by components/Grid.tsx
    players: 'dialog-players',

    // Owned by components/Landing.tsx
    nameCreate: 'dialog-name-create',
    nameJoin: 'dialog-name-join',
    custom: 'dialog-custom',
    customError: 'dialog-custom-error',

    // Owned by components/Footer.tsx
    guide: 'dialog-guide',

    // Owned by components/AccountMenu.tsx (mounted by Footer)
    account: 'dialog-account',
    accountDelete: 'dialog-account-delete',
    privacy: 'dialog-privacy',

    // Owned by components/dialogs/DailyDialogs.tsx
    dailySubmit: 'dialog-daily-submit',
    dailyGameOver: 'dialog-daily-game-over',
    dailyAlreadyPlayed: 'dialog-daily-already-played',
    dailyLeaderboard: 'dialog-daily-leaderboard',
} as const;

export type DialogId = (typeof DIALOGS)[keyof typeof DIALOGS];

const find = (id: DialogId) => document.getElementById(id) as HTMLDialogElement | null;

/**
 * Opens a dialog modally. No-op if it is not mounted, or already open.
 *
 * `showModal()` THROWS on a dialog that is already open, and these are opened
 * from socket handlers, where the same outcome can legitimately arrive twice —
 * a duplicated `gameOver`, a resume landing on top of a dialog nobody closed.
 * An exception there kills the handler mid-way, so the guard is not cosmetic.
 */
export const openDialog = (id: DialogId) => {
    const dialog = find(id);
    if (dialog && !dialog.open) dialog.showModal();
};

/** Closes a dialog. No-op if it is not mounted. */
export const closeDialog = (id: DialogId) => find(id)?.close();
