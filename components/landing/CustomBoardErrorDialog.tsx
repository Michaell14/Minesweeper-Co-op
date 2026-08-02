import React from 'react';
import { Dialog, DialogClose } from "@/components/ds";
import { BOARD_LIMITS } from "@/shared/boardConfig";
import { DIALOGS } from "@/lib/dialogs";

/** Shown when typed dimensions fall outside what the server would accept. */
export default function CustomBoardErrorDialog() {
    return (
        <Dialog
            id={DIALOGS.customError}
            title="There was an error with your customization:"
            alert
            actionsAlign="between"
            actions={<DialogClose aria-label="Close error dialog">Cancel</DialogClose>}>
            {/*
              * The old copy named the mines-under-half rule, which a player can
              * no longer break -- mines are derived from the difficulty now.
              * What is left is the dimension range.
              */}
            <p className="text-pixel-sm">
                Rows must be between {BOARD_LIMITS.MIN_ROWS} and {BOARD_LIMITS.MAX_ROWS},
                and columns between {BOARD_LIMITS.MIN_COLS} and {BOARD_LIMITS.MAX_COLS}.
            </p>
        </Dialog>
    );
}
