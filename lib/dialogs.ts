/**
 * Every dialog in the app, and the two ways to drive one.
 *
 * These are native <dialog> elements: NES.css styles them, and `form
 * method="dialog"` gives the buttons their close-on-submit behaviour, so they
 * are opened imperatively rather than by React state. The ids used to be bare
 * string literals spread across five files with nothing linking an opener to the
 * markup it opened. Import from here instead of typing an id.
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
    theme: 'dialog-theme',

    // Owned by components/dialogs/DailyDialogs.tsx
    dailySubmit: 'dialog-daily-submit',
    dailyGameOver: 'dialog-daily-game-over',
    dailyAlreadyPlayed: 'dialog-daily-already-played',
    dailyLeaderboard: 'dialog-daily-leaderboard',
} as const;

export type DialogId = (typeof DIALOGS)[keyof typeof DIALOGS];

const find = (id: DialogId) => document.getElementById(id) as HTMLDialogElement | null;

/** Opens a dialog modally. No-op if it is not mounted. */
export const openDialog = (id: DialogId) => find(id)?.showModal();

/** Closes a dialog. No-op if it is not mounted. */
export const closeDialog = (id: DialogId) => find(id)?.close();
