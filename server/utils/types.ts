export type createRoomType = {
    room: string,
    numRows: number,
    numCols: number,
    numMines: number,
    name: string,
    socket: any
}

export type basicCellType = {
    room: string,
    row: number,
    col: number
}

export type CellType = {
    row: number,
    col: number,
    isMine: boolean,
    isOpen: boolean,
    isFlagged: boolean,
    nearbyMines: number
} 