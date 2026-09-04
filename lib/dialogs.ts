/**
 * Every dialog in the app. Native <dialog> elements (`form method="dialog"`
 * closes on submit), opened imperatively. Import an id from here; never type the literal.
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

    // Owned by components/game/InviteFriendDialog.tsx, mounted ONCE by Grid (RoomPanel renders twice).
    inviteFriend: 'dialog-invite-friend',

    // Owned by components/Landing.tsx
    nameCreate: 'dialog-name-create',
    nameJoin: 'dialog-name-join',
    nameMatch: 'dialog-name-match',
    matchSearching: 'dialog-match-searching',
    matchError: 'dialog-match-error',
    custom: 'dialog-custom',
    customError: 'dialog-custom-error',

    // Owned by components/AccountMenu.tsx (mounted by the layout)
    account: 'dialog-account',
    accountDelete: 'dialog-account-delete',
    privacy: 'dialog-privacy',

    // Owned by components/dialogs/DailyDialogs.tsx
    dailyIntro: 'dialog-daily-intro',
    dailySubmit: 'dialog-daily-submit',
    dailyGameOver: 'dialog-daily-game-over',
    dailyAlreadyPlayed: 'dialog-daily-already-played',
    dailyLeaderboard: 'dialog-daily-leaderboard',
} as const;

export type DialogId = (typeof DIALOGS)[keyof typeof DIALOGS];

const find = (id: DialogId) => document.getElementById(id) as HTMLDialogElement | null;

/**
 * Opens a dialog modally. No-op if not mounted or already open: `showModal()`
 * THROWS on an open dialog, and socket handlers can deliver the same outcome twice.
 */
export const openDialog = (id: DialogId) => {
    const dialog = find(id);
    if (dialog && !dialog.open) dialog.showModal();
};

/** Closes a dialog. No-op if it is not mounted. */
export const closeDialog = (id: DialogId) => find(id)?.close();
