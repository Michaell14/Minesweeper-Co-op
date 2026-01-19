const { server, io } = require('./utils/initializeClient');
const { removePlayer, addPlayerToRoom } = require('./utils/playerUtils');
const { createRoom, resetGame } = require('./utils/gameUtils');
const { openCell, chordCell, toggleFlag } = require('./utils/boardUtils');
const { redisClient } = require('./utils/initializeRedisClient');

// When a new socket connects
io.on('connection', async (socket) => {
    const client = await redisClient;
    
    socket.on('createRoom', async ({ room, numRows, numCols, numMines, name, mode }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string' || room.length === 0 || room.length > 100) {
                socket.emit("createRoomError");
                return;
            }
            if (!name || typeof name !== 'string' || name.length === 0 || name.length > 50) {
                socket.emit("createRoomError");
                return;
            }
            if (typeof numRows !== 'number' || numRows < 8 || numRows > 32) {
                socket.emit("createRoomError");
                return;
            }
            if (typeof numCols !== 'number' || numCols < 8 || numCols > 16) {
                socket.emit("createRoomError");
                return;
            }
            if (typeof numMines !== 'number' || numMines < 1 || numMines >= (numRows * numCols) / 2) {
                socket.emit("createRoomError");
                return;
            }
            if (!mode || (mode !== 'co-op' && mode !== 'pvp')) {
                socket.emit("createRoomError");
                return;
            }

            const roomExists = await client.exists(`room:${room}`);

            // If the room exists, emit an error
            if (roomExists) {
                socket.join(`${socket.id}:${room}`);
                io.to(`${socket.id}:${room}`).emit("createRoomError");
                socket.leave(`${socket.id}:${room}`);
                return;
            }
            socket.join(room);

            await createRoom(room, numRows, numCols, numMines, mode); // Creates the room once we verified that it doesn't exist

            // For PVP mode, the creator is the host
            if (mode === 'pvp') {
                await client.hSet(`room:${room}`, { hostSocket: socket.id });
            }

            await addPlayerToRoom(room, socket.id, name); // Adds player's socket_id to current room
            io.to(room).emit("joinRoomSuccess", { room, mode, isHost: mode === 'pvp' }); // Returns success with mode and host status
        } catch (error) {
            console.error('Error in createRoom:', error);
            io.to(`${socket.id}:${room}`).emit("createRoomError");
        }
    })

    // When a player joins a room
    socket.on('joinRoom', async ({ room, name }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string' || room.length === 0 || room.length > 100) {
                socket.emit("joinRoomError");
                return;
            }
            if (!name || typeof name !== 'string' || name.length === 0 || name.length > 50) {
                socket.emit("joinRoomError");
                return;
            }

            const roomExists = await client.exists(`room:${room}`);

            socket.join(room);

            // If room does not exist, emit error + leave room
            if (!roomExists) {
                io.to(room).emit("joinRoomError");
                socket.leave(room);
                return;
            }

            // Check if it's a PVP room and if it's full
            const roomState = await client.hGetAll(`room:${room}`);
            const mode = roomState.mode || 'co-op';

            if (mode === 'pvp') {
                const players = JSON.parse(roomState.players || '[]');
                // Check if player is already in the room (reconnecting)
                const isReconnecting = players.includes(socket.id);

                if (!isReconnecting && players.length >= 2) {
                    socket.emit("pvpRoomFull");
                    socket.leave(room);
                    return;
                }
            }

            await addPlayerToRoom(room, socket.id, name); // Adds player's socket_id to current room

            // For PVP mode, check if this player is the host
            const isHost = mode === 'pvp' && roomState.hostSocket === socket.id;
            socket.emit("joinRoomSuccess", { room, mode, isHost }); // Send to joining player

            // If PVP mode and now 2 players, notify that room is ready
            if (mode === 'pvp') {
                const updatedPlayers = JSON.parse(await client.hGet(`room:${room}`, 'players') || '[]');
                if (updatedPlayers.length === 2) {
                    // Get host and player names
                    const hostSocket = roomState.hostSocket;
                    const guestSocket = updatedPlayers.find(p => p !== hostSocket);
                    const hostName = await client.hGet(`player:${hostSocket}`, 'name');
                    const guestName = await client.hGet(`player:${guestSocket}`, 'name');

                    // Notify both players that room is ready with player info
                    io.to(hostSocket).emit("pvpRoomReady", {
                        opponentName: guestName,
                        isHost: true
                    });
                    io.to(guestSocket).emit("pvpRoomReady", {
                        opponentName: hostName,
                        isHost: false
                    });
                }
            }
        } catch (error) {
            console.error('Error in joinRoom:', error);
            io.to(room).emit("joinRoomError");
            socket.leave(room);
        }
    });

    const isValid = async (room) => {
        const roomExists = await client.exists(`room:${room}`);
        const playerExists = await client.exists(`player:${socket.id}`);
        if (!roomExists || !playerExists) {
            io.to(room).emit("roomDoesNotExistError");
            socket.leave(room);
            return false;
        }

        // Verify player is actually in the room's player list
        const roomState = await client.hGetAll(`room:${room}`);
        const playersInRoom = JSON.parse(roomState.players || '[]');
        if (!playersInRoom.includes(socket.id)) {
            io.to(room).emit("roomDoesNotExistError");
            socket.leave(room);
            return false;
        }

        return true;
    }

    // When a player opens a cell
    socket.on('openCell', async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;
            if (typeof row !== 'number' || typeof col !== 'number') return;
            if (!Number.isInteger(row) || !Number.isInteger(col)) return;
            if (row < 0 || row > 100 || col < 0 || col > 100) return;

            // If player is somehow clicking on a cell, but they haven't managed to enter a room, then return
            // Scenario: Room times out and gets deleted
            if (!(await isValid(room))) return;
            await openCell(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in openCell:', error);
        }
    });

    socket.on("chordCell", async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;
            if (typeof row !== 'number' || typeof col !== 'number') return;
            if (!Number.isInteger(row) || !Number.isInteger(col)) return;
            if (row < 0 || row > 100 || col < 0 || col > 100) return;

            if (!(await isValid(room))) return;
            await chordCell(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in chordCell:', error);
        }
    });

    socket.on('toggleFlag', async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;
            if (typeof row !== 'number' || typeof col !== 'number') return;
            if (!Number.isInteger(row) || !Number.isInteger(col)) return;
            if (row < 0 || row > 100 || col < 0 || col > 100) return;

            if (!(await isValid(room))) return;
            await toggleFlag(row, col, room, socket.id);
        } catch (error) {
            console.error('Error in toggleFlag:', error);
        }
    });

    socket.on("emitConfetti", async ({ room }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;

            if (!(await isValid(room))) return;
            io.to(room).emit("receiveConfetti");
        } catch (error) {
            console.error('Error in emitConfetti:', error);
        }
    })

    socket.on('cellHover', async ({ room, row, col }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;
            if (typeof row !== 'number' || typeof col !== 'number') return;
            if (!Number.isInteger(row) || !Number.isInteger(col)) return;
            
            // Validate bounds (allow -1 for "no hover")
            if ((row !== -1 && col !== -1) && (row < 0 || row > 100 || col < 0 || col > 100)) return;

            // CRITICAL: Validate that the player is actually in the room
            // This prevents unauthorized hover spam
            const roomExists = await client.exists(`room:${room}`);
            const playerExists = await client.exists(`player:${socket.id}`);
            if (!roomExists || !playerExists) return;

            // Verify player is actually in the room's player list
            const roomState = await client.hGetAll(`room:${room}`);
            const playersInRoom = JSON.parse(roomState.players || '[]');
            if (!playersInRoom.includes(socket.id)) return;

            // Skip hover broadcasting in PVP mode - players shouldn't see opponent's cursor
            if (roomState.mode === 'pvp') return;

            // Get player name for the hover event
            const playerName = await client.hGet(`player:${socket.id}`, 'name');
            if (!playerName) return;

            // Broadcast to everyone else in the room
            socket.to(room).emit('playerHoverUpdate', { 
                id: socket.id, 
                row, 
                col, 
                name: playerName 
            });
        } catch (error) {
            console.error('Error in cellHover:', error);
        }
    });

    socket.on('resetGame', async ({ room }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;

            if (!(await isValid(room))) return;
            await resetGame(room);
        } catch (error) {
            console.error('Error in resetGame:', error);
        }
    });

    socket.on('startPvpGame', async ({ room }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;

            if (!(await isValid(room))) return;

            const roomState = await client.hGetAll(`room:${room}`);
            const mode = roomState.mode || 'co-op';

            if (mode !== 'pvp') return;

            const players = JSON.parse(roomState.players || '[]');
            if (players.length !== 2) return;

            // Only the host can start the game
            if (roomState.hostSocket !== socket.id) {
                return;
            }

            // Check if already started
            if (roomState.pvpStarted === 'true') return;

            const numRows = parseInt(roomState.numRows, 10);
            const numCols = parseInt(roomState.numCols, 10);
            const numMines = parseInt(roomState.numMines, 10);

            // Calculate total safe cells for progress tracking
            const totalSafeCells = (numRows * numCols) - numMines;

            // Assign players (host is player 1)
            const player1Socket = roomState.hostSocket;
            const player2Socket = players.find(p => p !== player1Socket);

            // Create empty boards - boards will be generated on first click for each player
            const emptyBoard = Array.from({ length: numRows }, () =>
                Array.from({ length: numCols }, () => ({
                    isMine: false,
                    isOpen: false,
                    isFlagged: false,
                    nearbyMines: 0,
                }))
            );

            // Mark game as started with empty boards (NOT initialized - will generate on first click)
            await client.hSet(`room:${room}`, {
                pvpStarted: 'true',
                totalSafeCells: totalSafeCells.toString(),
                player1Socket,
                player2Socket,
                player1Board: JSON.stringify(emptyBoard),
                player2Board: JSON.stringify(emptyBoard),
                player1Initialized: 'false', // Will be set to true on first click
                player2Initialized: 'false', // Will be set to true on first click
                player1GameOver: 'false',
                player2GameOver: 'false',
                player1GameWon: 'false',
                player2GameWon: 'false',
                player1Progress: '0',
                player2Progress: '0',
                winnerSocket: '',
            });

            // Set player indices and opponent names
            const player1Name = await client.hGet(`player:${player1Socket}`, 'name');
            const player2Name = await client.hGet(`player:${player2Socket}`, 'name');

            await client.hSet(`player:${player1Socket}`, {
                pvpPlayerIndex: '0',
                opponentName: player2Name
            });
            await client.hSet(`player:${player2Socket}`, {
                pvpPlayerIndex: '1',
                opponentName: player1Name
            });

            // Notify both players game started
            io.to(room).emit('pvpGameStarted', {
                totalSafeCells
            });

            // Send empty boards to both players - they can click anywhere for first click
            io.to(player1Socket).emit('pvpBoardUpdate', {
                board: emptyBoard,
                playerIndex: 0,
                opponentName: player2Name,
                opponentProgress: 0,
                totalSafeCells
            });

            io.to(player2Socket).emit('pvpBoardUpdate', {
                board: emptyBoard,
                playerIndex: 1,
                opponentName: player1Name,
                opponentProgress: 0,
                totalSafeCells
            });
        } catch (error) {
            console.error('Error in startPvpGame:', error);
        }
    });

    socket.on('resetMyBoard', async ({ room }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;

            if (!(await isValid(room))) return;

            const roomState = await client.hGetAll(`room:${room}`);
            const mode = roomState.mode || 'co-op';

            if (mode !== 'pvp') return;

            // Can't reset if game has a winner already (use rematch instead)
            if (roomState.winnerSocket && roomState.winnerSocket !== '') {
                return;
            }

            const playerData = await client.hGetAll(`player:${socket.id}`);
            const playerIndex = parseInt(playerData.pvpPlayerIndex || '0', 10);

            const numRows = parseInt(roomState.numRows, 10);
            const numCols = parseInt(roomState.numCols, 10);

            // Create empty board - will be generated on next first click
            const emptyBoard = Array.from({ length: numRows }, () =>
                Array.from({ length: numCols }, () => ({
                    isMine: false,
                    isOpen: false,
                    isFlagged: false,
                    nearbyMines: 0,
                }))
            );

            // Reset player's board and state - set initialized to false for new first-click
            const boardKey = `player${playerIndex + 1}Board`;
            const initializedKey = `player${playerIndex + 1}Initialized`;
            const gameOverKey = `player${playerIndex + 1}GameOver`;
            const progressKey = `player${playerIndex + 1}Progress`;

            await client.hSet(`room:${room}`, {
                [boardKey]: JSON.stringify(emptyBoard),
                [initializedKey]: 'false', // Allow new first-click board generation
                [gameOverKey]: 'false',
                [progressKey]: '0',
            });

            // Reset player's score
            await client.hSet(`player:${socket.id}`, { score: '0' });

            // Send empty board to player - they can click anywhere for new first click
            io.to(socket.id).emit('pvpBoardUpdate', {
                board: emptyBoard,
                playerIndex,
                opponentName: playerData.opponentName || 'Opponent'
            });

            // Notify opponent of reset
            const players = JSON.parse(roomState.players || '[]');
            const opponentSocket = players.find(p => p !== socket.id);
            if (opponentSocket) {
                io.to(opponentSocket).emit('pvpOpponentReset');
                // Also send progress reset so opponent's UI updates to 0%
                const numMines = parseInt(roomState.numMines, 10);
                const totalSafeCells = (numRows * numCols) - numMines;
                io.to(opponentSocket).emit('pvpOpponentProgress', {
                    progress: 0,
                    totalSafeCells,
                    percentage: 0
                });
            }

            // Update player stats
            const { updatePlayerStatsInRoom } = require('./utils/playerUtils');
            await updatePlayerStatsInRoom(room);
        } catch (error) {
            console.error('Error in resetMyBoard:', error);
        }
    });

    // PVP Rematch - Reset entire game for both players (host only)
    socket.on('pvpRematch', async ({ room }) => {
        try {
            // Validate input parameters
            if (!room || typeof room !== 'string') return;

            if (!(await isValid(room))) return;

            const roomState = await client.hGetAll(`room:${room}`);
            const mode = roomState.mode || 'co-op';

            if (mode !== 'pvp') return;

            // Only host can initiate rematch
            if (roomState.hostSocket !== socket.id) {
                return;
            }

            const players = JSON.parse(roomState.players || '[]');
            if (players.length !== 2) return;

            const numRows = parseInt(roomState.numRows, 10);
            const numCols = parseInt(roomState.numCols, 10);
            const numMines = parseInt(roomState.numMines, 10);
            const totalSafeCells = (numRows * numCols) - numMines;

            // Create empty boards - will be generated on first click for each player
            const emptyBoard = Array.from({ length: numRows }, () =>
                Array.from({ length: numCols }, () => ({
                    isMine: false,
                    isOpen: false,
                    isFlagged: false,
                    nearbyMines: 0,
                }))
            );

            // Reset all game state with uninitialized boards
            await client.hSet(`room:${room}`, {
                pvpStarted: 'true',
                totalSafeCells: totalSafeCells.toString(),
                player1Board: JSON.stringify(emptyBoard),
                player2Board: JSON.stringify(emptyBoard),
                player1Initialized: 'false', // Will generate on first click
                player2Initialized: 'false', // Will generate on first click
                player1GameOver: 'false',
                player2GameOver: 'false',
                player1GameWon: 'false',
                player2GameWon: 'false',
                player1Progress: '0',
                player2Progress: '0',
                winnerSocket: '',
            });

            // Reset player scores
            const player1Socket = roomState.player1Socket;
            const player2Socket = roomState.player2Socket;

            await client.hSet(`player:${player1Socket}`, { score: '0' });
            await client.hSet(`player:${player2Socket}`, { score: '0' });

            // Get player names
            const player1Name = await client.hGet(`player:${player1Socket}`, 'name');
            const player2Name = await client.hGet(`player:${player2Socket}`, 'name');

            // Notify both players with their host status
            io.to(player1Socket).emit('pvpRematchStarted', { totalSafeCells, isHost: true });
            io.to(player2Socket).emit('pvpRematchStarted', { totalSafeCells, isHost: false });

            // Send empty boards to players - they can click anywhere for first click
            io.to(player1Socket).emit('pvpBoardUpdate', {
                board: emptyBoard,
                playerIndex: 0,
                opponentName: player2Name,
                opponentProgress: 0,
                totalSafeCells
            });

            io.to(player2Socket).emit('pvpBoardUpdate', {
                board: emptyBoard,
                playerIndex: 1,
                opponentName: player1Name,
                opponentProgress: 0,
                totalSafeCells
            });

            // Update player stats
            const { updatePlayerStatsInRoom } = require('./utils/playerUtils');
            await updatePlayerStatsInRoom(room);
        } catch (error) {
            console.error('Error in pvpRematch:', error);
        }
    });

    socket.on("playerLeave", async () => {
        try {
            await removePlayer(socket, socket.id);
        } catch (error) {
            console.error('Error in playerLeave:', error);
        }
    });

    socket.on('disconnect', async () => {
        try {
            await removePlayer(socket, socket.id);
        } catch (error) {
            console.error('Error in disconnect:', error);
        }
    });
});

const PORT = process.env.PORT || 3001;
// Start the server, enter
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
