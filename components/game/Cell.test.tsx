// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import Cell from "./Cell";
import type { Cell as CellType } from "@/app/store";

/**
 * When a cell shows the mine under it.
 *
 * The server is the authority: a closed cell reports `isMine: false` unless the
 * game has ended and it deliberately revealed the layout. But a revealed mine is
 * still CLOSED, so the client needs its own reason to draw a bomb rather than a
 * covered square — and it used to take that reason from `gameOver` alone.
 *
 * `gameOver` means "you hit a mine". The player who LOSES A RACE never did: the
 * opponent finished first, the server sent them their board with every mine in
 * it, and it rendered as an ordinary half-played grid. The one terminal state in
 * the game that showed you nothing.
 *
 * Asserted through the accessible name, because that is what breaks with it: a
 * mine nobody can see is also a mine no screen reader announces.
 */

const closedMine: CellType = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };

const renderCell = (cell: CellType) =>
    render(
        <Cell
            cell={cell}
            row={0}
            col={0}
            toggleFlag={vi.fn()}
            openCell={vi.fn()}
            chordCell={vi.fn()}
            emitCellHover={vi.fn()}
        />,
    );

const isShownAsAMine = () => screen.queryByRole("gridcell", { name: /^Mine at/ }) !== null;

beforeEach(() => {
    const store = useMinesweeperStore.getState();
    store.setGameOver(false);
    store.setPvpWinner(null);
    store.setMode("co-op");
    store.setPvpStarted(false);
});

describe("a closed cell the server says is a mine", () => {
    test("is hidden while the game is still on", () => {
        // Unreachable in practice — projection would have sent isMine: false —
        // but it pins down that the flag, not the payload, is what shows it.
        renderCell(closedMine);

        expect(isShownAsAMine()).toBe(false);
    });

    test("is shown once this player has hit a mine", () => {
        useMinesweeperStore.getState().setGameOver(true);

        renderCell(closedMine);

        expect(isShownAsAMine()).toBe(true);
    });

    test("is shown to the player who lost a race without hitting one", () => {
        const store = useMinesweeperStore.getState();
        store.setMode("pvp");
        store.setPvpStarted(true);
        store.setPvpWinner("Someone else");   // and gameOver stays false

        renderCell(closedMine);

        expect(isShownAsAMine()).toBe(true);
    });

    test("stays hidden mid-race, while there is no winner", () => {
        const store = useMinesweeperStore.getState();
        store.setMode("pvp");
        store.setPvpStarted(true);

        renderCell(closedMine);

        expect(isShownAsAMine()).toBe(false);
    });

    test("a decided co-op game is unaffected by the PVP branch", () => {
        // pvpWinner can survive a mode change in the store; co-op must not start
        // revealing boards because of a race played earlier in the session.
        useMinesweeperStore.getState().setPvpWinner("Someone else");

        renderCell(closedMine);

        expect(isShownAsAMine()).toBe(false);
    });
});
