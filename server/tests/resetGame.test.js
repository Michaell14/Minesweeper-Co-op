/**
 * Regression test for the gameUtils <-> playerUtils require cycle.
 * !! THE REQUIRE ORDER BELOW IS THE TEST. DO NOT REORDER OR TIDY IT. !!
 * server.js requires playerUtils before gameUtils; while the cycle existed,
 * gameUtils captured playerUtils' exports as undefined, and resetGame() threw
 * AFTER emitting the fresh board, so scores were silently never reset.
 * Requiring gameUtils first hides the bug entirely.
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
