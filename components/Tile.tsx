
import React, { useState } from 'react';

export type TileData = {
    isMine: boolean;
    value?: number;
};

export default function Tile({ data }: { data: TileData }) {

    const [isOpen, setIsOpen] = useState(false);
    const [isMarked, setIsMarked] = useState(false);


    const onTileClicked = (e: React.MouseEvent) => {
        if (e.type === 'click') {
            console.log("left click");

            // For an open tile, we open it -> MUST LATER CHECK IF IT'S A BOMB
            if (!isMarked) {
                setIsOpen(true);
            }
        } else if (e.type === 'contextmenu') {
            console.log("right click")

            // If the tile is not opened, we mark/unmark it
            // If tile is already opened, then do nothing
            if (!isOpen) {
                setIsMarked(!isMarked);
            }
        }
    };


    const value = data.isMine ? 'X' : data.value;

    return (
        <div className="" onClick={(e) => { onTileClicked(e) }} onContextMenu={(e) => { onTileClicked(e) }}>
            {isOpen ? value :
                isMarked ? '🚩' : 'Empty'
            }

        </div>
    )
}
