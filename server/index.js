import { mkdirSync } from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });

const app = createApp(config);
try {
    await app.ensureAdmin();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

app.server.listen(config.port, config.host, () => {
    console.log(`Kanselaris listening on ${config.host}:${config.port} (public URL ${config.publicUrl})`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
        console.log(`Received ${signal}, shutting down`);
        await app.close();
        process.exit(0);
    });
}
