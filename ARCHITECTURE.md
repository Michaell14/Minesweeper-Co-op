# Minesweeper Co-op Architecture Documentation

## Overview
Minesweeper Co-op is a real-time multiplayer Minesweeper game built with Next.js, Socket.io, and Zustand for state management.

## Tech Stack
- **Frontend**: Next.js 14+ (React, TypeScript)
- **State Management**: Zustand
- **Real-time Communication**: Socket.io
- **Styling**: Chakra UI + Tailwind CSS + NES.css (retro theme)
- **Deployment**: Vercel (frontend) + Heroku (backend)

## Project Structure

```
/Minesweeper-Co-op
├── app/
│   ├── page.tsx           # Main component (Socket.io + game logic)
│   ├── store.tsx          # Zustand store (global state)
│   ├── layout.tsx         # Root layout with fonts
│   └── globals.css        # Global styles
├── components/
│   ├── Grid.tsx           # Game board renderer + chording logic
│   ├── Cell.tsx           # Individual cell component
│   ├── Landing.tsx        # Room creation/join interface
│   └── Footer.tsx         # Footer component
├── lib/
│   ├── difficultyConfig.tsx  # Difficulty presets (Easy/Medium/Hard)
│   ├── initSocket.ts         # Socket.io client initialization
│   └── confetti.ts           # Confetti animation helper
└── public/               # Static assets
```

## Core Components

### 1. Home Component (`app/page.tsx`)
**Purpose**: Main orchestrator for the entire application

**Responsibilities**:
- Socket.io connection management
- Socket event listeners (board updates, game state changes, errors)
- Socket emit functions (create/join room, cell actions, confetti)
- Room management (leave, reset)
- Conditional rendering (Landing vs Grid)

**Key Sections**:
- **STATE & STORE**: Zustand store access
- **SOCKET INITIALIZATION**: Connect/disconnect socket
- **ROOM MANAGEMENT**: Leave room and reset state
- **SOCKET EVENT HANDLERS**: Real-time multiplayer communication
- **SOCKET EMIT FUNCTIONS**: Client → Server actions
- **RENDER**: Landing page or game grid + error dialogs

### 2. Zustand Store (`app/store.tsx`)
**Purpose**: Centralized state management for all game data

**State Categories**:
1. **Game State**: `board`, `gameOver`, `gameWon`
2. **Board Configuration**: `numRows`, `numCols`, `numMines`, `difficulty`
3. **Room & Player Data**: `room`, `playerJoined`, `name`, `playerStatsInRoom`, `gameOverName`
4. **UI State**: `isChecked` (mobile mode), `r`, `c`, `leftClick`, `rightClick`, `bothPressed`

**Key Interfaces**:
- `Cell`: Represents a single board cell
- `PlayerStats`: Player name and score
- `MinesweeperState`: Complete game state + setters

### 3. Grid Component (`components/Grid.tsx`)
**Purpose**: Render game board and handle user interactions

**Responsibilities**:
- Display game board (2D array of cells)
- Show player stats and room info
- Handle chording detection (both mouse buttons pressed)
- Mobile flag mode toggle
- Desktop vs Mobile responsive layouts

**Key Features**:
- **Chording Logic**: Detects simultaneous left+right click to open all unflagged neighbors
- **Responsive Design**: Desktop (side panels) vs Mobile (compact controls)
- **Game Status**: Win/Loss badges

### 4. Cell Component (`components/Cell.tsx`)
**Purpose**: Individual Minesweeper cell with click/flag interactions

**Responsibilities**:
- Visual representation (open/closed/flagged/mine)
- Mouse event handling (left/right/middle click, hover)
- Context menu prevention (right-click)
- Coordinate tracking for chording

### 5. Landing Component (`components/Landing.tsx`)
**Purpose**: Room creation and joining interface

**Responsibilities**:
- Create room form (with difficulty selection)
- Join room form
- Custom difficulty configuration
- Player name input
- Validation and error dialogs

### 6. Difficulty Configuration (`lib/difficultyConfig.tsx`)
**Purpose**: Define preset board dimensions and mine counts

**Difficulty Levels**:
- **Easy**: 9×9, 10 mines (12.3% density)
- **Medium**: 16×16, 40 mines (15.6% density)
- **Hard**: 20×16, 60 mines (18.8% density)

**Design Philosophy**: Lower mine densities reduce 50/50 guessing situations

## Data Flow

### Client → Server (Socket Emit)
```typescript
socket.emit('createRoom', { room, numRows, numCols, numMines, name })
socket.emit('joinRoom', { room, name })
socket.emit('openCell', { room, row, col })
socket.emit('chordCell', { room, row, col })
socket.emit('toggleFlag', { room, row, col })
socket.emit('resetGame', { room })
socket.emit('emitConfetti', { room })
socket.emit('playerLeave')
```

### Server → Client (Socket On)
```typescript
socket.on('boardUpdate', (updatedBoard: Cell[][]) => {...})
socket.on('updateCells', (toUpdate: CellUpdate[]) => {...})
socket.on('playerStatsUpdate', (updatedStats: PlayerStats[]) => {...})
socket.on('gameWon', () => {...})
socket.on('gameOver', (playerName: string) => {...})
socket.on('resetEveryone', () => {...})
socket.on('joinRoomSuccess', (roomCode: string) => {...})
socket.on('joinRoomError', () => {...})
socket.on('createRoomError', () => {...})
socket.on('roomDoesNotExistError', () => {...})
socket.on('receiveConfetti', () => {...})
```

## Key Features

### 1. Chording (Middle-Click)
**What**: Open all unflagged neighbors of a satisfied number
**How**: Detect both mouse buttons pressed simultaneously
**Implementation**:
- `Grid.tsx` monitors `leftClick` + `rightClick` state
- When both true, calls `chordCell(r, c)`
- Server validates: number cell's value equals adjacent flag count

### 2. Mobile Flag Mode
**What**: Toggle between "click to open" and "click to flag" modes
**Why**: Touch devices can't right-click
**Implementation**:
- `isChecked` state: true = click mode, false = flag mode
- Switch component in mobile view
- Cell component checks `isChecked` to determine action

### 3. Real-time Multiplayer
**What**: Multiple players collaborate on the same board
**How**: Socket.io broadcasts cell changes to all room members
**Optimizations**:
- Full `boardUpdate` only on join/reset
- Incremental `updateCells` for individual actions
- Player stats updated independently

## Important Notes

### React Hooks Dependencies
- **Zustand setters are stable**: Don't include in dependency arrays (e.g., `setBoard`, `setBothPressed`)
- **Functions passed as props**: Wrap in `useCallback` if used in child component's `useEffect` (e.g., `chordCell`)
- **Socket in dependencies**: Always include to ensure listeners update when socket changes

### Common Pitfalls
1. **Infinite Loops**: Not memoizing functions passed to Grid component
2. **Stale Closures**: Forgetting dependencies in `useEffect`
3. **Initialization Order**: `leaveRoom` must be defined before `useEffect` that uses it

## Difficulty Tuning

### Current Settings (Optimized for Logic)
```typescript
Easy:   9×9,  10 mines = 12.3% density
Medium: 16×16, 40 mines = 15.6% density
Hard:   20×16, 60 mines = 18.8% density
```

### How to Adjust
Edit `lib/difficultyConfig.tsx` and update defaults in:
- `app/store.tsx` (initial state)
- `app/page.tsx` (leaveRoom reset)
- `components/Landing.tsx` (cancelCustom reset)

## Socket.io Events Reference

### Room Management
| Event | Direction | Data | Purpose |
|-------|-----------|------|---------|
| `createRoom` | C→S | `{room, numRows, numCols, numMines, name}` | Create new game room |
| `joinRoom` | C→S | `{room, name}` | Join existing room |
| `joinRoomSuccess` | S→C | `roomCode` | Confirm successful join |
| `joinRoomError` | S→C | - | Room doesn't exist |
| `createRoomError` | S→C | - | Room already exists |
| `playerLeave` | C→S | - | Leave current room |
| `roomDoesNotExistError` | S→C | - | Room deleted during play |

### Game Actions
| Event | Direction | Data | Purpose |
|-------|-----------|------|---------|
| `openCell` | C→S | `{room, row, col}` | Reveal a cell |
| `chordCell` | C→S | `{room, row, col}` | Middle-click chord |
| `toggleFlag` | C→S | `{room, row, col}` | Flag/unflag cell |
| `resetGame` | C→S | `{room}` | Reset board |

### Game State Updates
| Event | Direction | Data | Purpose |
|-------|-----------|------|---------|
| `boardUpdate` | S→C | `Cell[][]` | Full board state |
| `updateCells` | S→C | `CellUpdate[]` | Partial cell updates |
| `gameWon` | S→C | - | All cells cleared |
| `gameOver` | S→C | `playerName` | Someone hit mine |
| `resetEveryone` | S→C | - | Reset all players |
| `playerStatsUpdate` | S→C | `PlayerStats[]` | Score updates |

### Special
| Event | Direction | Data | Purpose |
|-------|-----------|------|---------|
| `emitConfetti` | C→S | `{room}` | Send confetti |
| `receiveConfetti` | S→C | - | Show confetti |

## Future Improvements
- Extract dialog components into separate files
- Create custom hook for socket event listeners (`useSocketEvents`)
- Add TypeScript types for socket event payloads
- Implement room persistence (database)
- Add spectator mode
- Implement game replays
