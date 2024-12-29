
<h1 align="center">Minesweeper Co-op</h1>

<p align="center">
  <a href="https://github.com/Michaell14/Minesweeper-Co-op/actions/workflows/vercel.yml">
    <img src="https://github.com/Michaell14/Minesweeper-Co-op/actions/workflows/vercel.yml/badge.svg" alt="Vercel Build Status" />
  </a>
    <a href="https://vercel.com/michaell14/minesweeper-co-op">
    <img src="https://vercelbadge.vercel.app/api/michaell14/minesweeper-co-op" alt="Vercel Deployment Status"/>
  </a>
  <a href="https://github.com/Michaell14/Minesweeper-Co-op/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
  </a>
</p>

<p align="center">
  This is an online multiplayer Minesweeper game built with Next.js, allowing multiple players to collaborate in real-time. Create a room, share the code with friends, and work together to clear the minefield!
</p>

## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Running the Project](#running-the-project)
- [Dependencies](#dependencies)
- [Contribution Guide](#contribution-guide)
- [License](#license)
- [Contact](#contact)

## Features

- **Multiplayer Gameplay:** Play with friends in real-time.
- **Room Creation:** Easily create and share room codes.
- **Customizable Difficulty:** Choose from Easy, Medium, Hard, or Expert.
- **Real-time Updates:** Board states are synced across all players in a room.
- **Game State Management:** Tracks game over and win conditions for all players.
- **Responsive Design:** Works well on various screen sizes.
- **User-Friendly Interface:** Intuitive design with an 8-bit retro theme.

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/Michaell14/Minesweeper-Co-op.git
    cd Minesweeper-Co-op
    ```

2. Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    # or
    bun install
    ```

3.  The server requires environment variables for Redis configuration. Create a `.env` file in the `server` directory, and add your Redis credentials:
    ```env
    DB_PASS=<your_redis_password>
    HOST=<your_redis_host>
    REDIS_PORT=<your_redis_port>
    ```
   
   The frontend also uses environment variables (though it defaults to localhost if `NODE_ENV` is `development`)

## Running the Project

1. Start the development server for the client:
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    # or
    bun dev
    ```

2. Start the development server for the server:
    ```bash
    node server/server.js
    ```

3.  Open your browser and navigate to `http://localhost:3000` to play the game.

## Dependencies

### Major Dependencies

-   **Next.js**: React framework for building web applications.
-   **React**: JavaScript library for building user interfaces.
-   **Socket.io**: Enables real-time, bidirectional communication between web clients and servers.
-   **Zustand**: State management library for React.
-   **@chakra-ui/react**:  UI component library
-   **Redis**: In-memory data structure store used for storing game state.
-   **canvas-confetti**: Used to render confetti when a user wins.

### Tools

-   **npm**: Package manager for JavaScript.
-   **yarn**: Alternative package manager for JavaScript.
-   **pnpm**: Another alternative package manager for JavaScript.
-   **bun**: JavaScript runtime, package manager, bundler and test runner
-   **eslint**: Linter for JavaScript and TypeScript.
-   **typescript**:  Superset of JavaScript that adds static types
-   **tailwindcss**: CSS framework used for styling.

## Contribution Guide

Contributions are welcome! Here's how you can contribute:

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/your-feature`).
3.  Make your changes and commit them (`git commit -m "Add your feature"`).
4.  Push to the branch (`git push origin feature/your-feature`).
5.  Open a pull request.

Please ensure your code is well-documented and adheres to the project's coding standards.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

For any questions or feedback, please contact:

*   **Maintainer**: [Michael](https://github.com/Michaell14)
*   **Email**: placeholder@email.com
