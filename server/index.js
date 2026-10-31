import { accessSync, constants, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });

// Stop with a clear message when the database can't be written, for example after an
// upgrade from a version that ran as a different user
for (const path of [config.dataDir, join(config.dataDir, 'scribe.db')]) {
    try {
        accessSync(path, constants.W_OK);
    } catch (error) {
        if (error.code === 'ENOENT') continue;
        console.error(`Cannot write to ${path} as user ${process.getuid?.()}.`);
        console.error('If you upgraded from an older version, hand the data to the app once:');
        console.error('  docker compose down');
        console.error('  docker run --rm -v <project>_scribe-data:/data busybox:1.37 chown -R 65532:65532 /data');
        process.exit(1);
    }
}

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
