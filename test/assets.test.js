import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

// In production, pages link to files under /v/<fingerprint>/ so that browsers and
// Cloudflare never keep serving an outdated stylesheet after an update.

let app;
let base;
let dataDir;

before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'scribe-assets-'));
    const config = loadConfig({
        NODE_ENV: 'production',
        DATA_DIR: dataDir,
        ADMIN_USERNAME: 'abt',
        ADMIN_PASSWORD: 'test-admin-password',
        LOG_REQUESTS: 'false',
    });
    app = createApp(config);
    await app.ensureAdmin();
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
});

after(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
});

const get = (path, headers = {}) => fetch(base + path, { headers, redirect: 'manual' });

test('pages link to versioned files', async () => {
    const html = await (await get('/login')).text();
    const stylesheet = html.match(/href="(\/v\/[A-Za-z0-9_-]+\/css\/style\.css)"/)?.[1];
    assert.ok(stylesheet, 'stylesheet should be versioned');
    assert.doesNotMatch(html, /(?:href|src)="\/?(?:css|js|images|fonts)\//);

    const response = await get(stylesheet);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

test('versioned files behind the login stay private and protected', async () => {
    const html = await (await get('/login')).text();
    const version = html.match(/\/v\/([A-Za-z0-9_-]+)\//)[1];

    const anonymous = await get(`/v/${version}/js/app.js`);
    assert.equal(anonymous.status, 303);
    assert.equal(anonymous.headers.get('location'), '/login');

    const login = await fetch(`${base}/login`, {
        method: 'POST', body: new URLSearchParams({ username: 'abt', password: 'test-admin-password' }), redirect: 'manual',
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const script = await get(`/v/${version}/js/app.js`, { cookie });
    assert.equal(script.status, 200);
    assert.equal(script.headers.get('cache-control'), 'private, max-age=31536000, immutable');
});

test('unversioned paths still work and are revalidated', async () => {
    const response = await get('/css/style.css');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
});

test('weak ETags from Cloudflare still give a 304', async () => {
    const first = await get('/css/style.css');
    const etag = first.headers.get('etag');
    const second = await get('/css/style.css', { 'if-none-match': `W/${etag}` });
    assert.equal(second.status, 304);
});
