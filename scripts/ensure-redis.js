/** Checks Redis is listening; if not, starts it via the OS service manager and polls up to 5s. */
const net = require('net');
const { execSync } = require('child_process');

const PORT = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_ATTEMPTS = 50; // 5 seconds max (50 * 100ms)

function isPortOpen(port, host) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(200);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, host);
    });
}

function startRedisService() {
    const platform = process.platform;
    try {
        if (platform === 'darwin') {
            execSync('brew services start redis 2>/dev/null', { stdio: 'ignore' });
        } else if (platform === 'linux') {
            execSync('sudo systemctl start redis 2>/dev/null || service redis-server start 2>/dev/null', { stdio: 'ignore' });
        }
    } catch {
        // Best effort.
    }
}

async function main() {
    if (await isPortOpen(PORT, HOST)) {
        process.exit(0);
    }

    console.log('⚡ Redis is down. Attempting to start Redis service...');
    startRedisService();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, 100));
        if (await isPortOpen(PORT, HOST)) {
            console.log('✅ Redis service is ready!');
            process.exit(0);
        }
    }

    console.warn('⚠️  Redis did not become ready within 5 seconds. Launching servers...');
    process.exit(0);
}

main();
