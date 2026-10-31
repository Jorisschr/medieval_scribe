import { resolve } from 'node:path';

// All settings come from environment variables; see .env.example.
export function loadConfig(env = process.env) {
    const port = Number(env.PORT) || 8080;
    const publicUrl = (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/+$/, '');

    return {
        port,
        host: env.HOST || '0.0.0.0',
        publicUrl,
        dataDir: resolve(env.DATA_DIR || 'data'),
        publicDir: resolve(import.meta.dirname, '..', 'public'),
        production: env.NODE_ENV === 'production',
        // Only behind a reverse proxy: take the client IP and host from X-Forwarded-* headers
        trustProxy: env.TRUST_PROXY === 'true',
        secureCookies: publicUrl.startsWith('https://'),
        sessionDays: Number(env.SESSION_DAYS) || 30,
        adminUsername: env.ADMIN_USERNAME,
        adminPassword: env.ADMIN_PASSWORD,
        log: env.LOG_REQUESTS !== 'false',
    };
}
