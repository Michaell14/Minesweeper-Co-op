import 'dotenv/config';
import { createClient } from 'redis';

let redisClient: any = null;

export async function initializeRedisClient() {
    if (redisClient) return redisClient;
    
    redisClient = createClient({
        username: 'default',
        password: process.env.DB_PASS,
        socket: {
            host: process.env.HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
        },
    });

    try {
        await redisClient.connect();
        console.log('Connected to Redis');
        await redisClient.flushDb();
        return redisClient;
    } catch (err) {
        console.error('Redis connection error:', err);
        throw err;
    }
}

// Initialize the client immediately
initializeRedisClient().catch(console.error);

export { redisClient }; 