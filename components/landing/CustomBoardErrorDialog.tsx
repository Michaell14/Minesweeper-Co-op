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
            {/* Only the dimension range can be wrong: mines are derived from the
                difficulty, so the mines-under-half rule cannot be broken. */}
            <p className="text-pixel-sm">
                Rows must be between {BOARD_LIMITS.MIN_ROWS} and {BOARD_LIMITS.MAX_ROWS},
                and columns between {BOARD_LIMITS.MIN_COLS} and {BOARD_LIMITS.MAX_COLS}.
            </p>
        </Dialog>
    );
}
