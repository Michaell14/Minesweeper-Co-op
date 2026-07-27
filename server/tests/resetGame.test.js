/**
 * Regression test for the gameUtils <-> playerUtils require cycle.
 *
 * !! THE REQUIRE ORDER BELOW IS THE TEST. DO NOT REORDER OR TIDY IT. !!
 *
 * server.js requires playerUtils (line 2) before gameUtils (line 3). While the
 * cycle existed, that order meant gameUtils destructured playerUtils' exports
 * before they were assigned, so `resetPlayerScores` and `updatePlayerStatsInRoom`
 * were captured as undefined. resetGame() then threw a TypeError *after* it had
 * already emitted the fresh board, so co-op "Reset Board" appeared to work while
 * silently never resetting anyone's score.
 *
 * Requiring gameUtils first hides the bug entirely, which is why it survived so
 * long — the load order is the whole story.
 */

require('../utils/playerUtils'); // must be first — see above
const { resetGame } = require('../utils/gameUtils');
const { redisClient } = require('../utils/initializeRedisClient');

describe('resetGame (require-order regression)', () => {
    let client;

    beforeEach(async () => {
        client = await redisClient;
        jest.clearAllMocks();
        client.hGetAll.mockResolvedValue({
            numRows: '4',
            numCols: '4',
            players: JSON.stringify(['socket-1']),
        });
        client.hGet.mockResolvedValue(JSON.stringify(['socket-1']));
        client.hSet.mockResolvedValue(1);
    });

    test('completes without throwing', async () => {
        await expect(resetGame('testroom')).resolves.not.toThrow();
    });

    test('resets player scores (the step the require cycle used to skip)', async () => {
        await resetGame('testroom');

        expect(client.hSet).toHaveBeenCalledWith('player:socket-1', { score: '0' });
    });

    test('clears room game state', async () => {
        await resetGame('testroom');

        expect(client.hSet).toHaveBeenCalledWith(
            'room:testroom',
            expect.objectContaining({
                gameOver: 'false',
                gameWon: 'false',
                initialized: 'false',
                gameOverName: '',
            })
        );
    });
});
