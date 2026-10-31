import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

const ADMIN = { username: 'abt', password: 'test-admin-password' };
const DAY = 24 * 60 * 60 * 1000;

let app;
let base;
let dataDir;

before(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'scribe-test-'));
    const config = loadConfig({
        DATA_DIR: dataDir,
        ADMIN_USERNAME: ADMIN.username,
        ADMIN_PASSWORD: ADMIN.password,
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

async function request(path, { method = 'GET', form, cookie, origin } = {}) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (origin) headers.origin = origin;
    const response = await fetch(base + path, {
        method,
        headers,
        body: form && new URLSearchParams(form),
        redirect: 'manual',
    });
    return {
        status: response.status,
        location: response.headers.get('location'),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
        headers: response.headers,
        body: await response.text(),
    };
}

async function login(username, password) {
    const response = await request('/login', { method: 'POST', form: { username, password } });
    assert.equal(response.status, 303, `login as ${username} failed: ${response.body}`);
    return response.cookie;
}

async function createInvite(adminCookie, { label = '', maxUses = 1, days = 7 } = {}) {
    const response = await request('/admin/invites', {
        method: 'POST', cookie: adminCookie, form: { label, maxUses, days },
    });
    assert.equal(response.status, 200);
    const link = response.body.match(/value="(http[^"]+\/invite\/[^"]+)"/)[1];
    return new URL(link).pathname;
}

function signUp(invitePath, username, password = 'een-lang-wachtwoord', confirm = password) {
    return request(invitePath, { method: 'POST', form: { username, password, confirm } });
}

describe('access without logging in', () => {
    test('the app and its scripts redirect to the login page', async () => {
        for (const path of ['/', '/js/app.js', '/js/scribe/index.js', '/admin', '/nope']) {
            const response = await request(path);
            assert.equal(response.status, 303, path);
            assert.equal(response.location, '/login', path);
        }
    });

    test('the login page and its styling are public', async () => {
        assert.equal((await request('/login')).status, 200);
        assert.equal((await request('/css/style.css')).status, 200);
        assert.equal((await request('/healthz')).body, 'ok');
    });

    test('pages are sent with security headers', async () => {
        const { headers } = await request('/login');
        assert.match(headers.get('content-security-policy'), /default-src 'self'/);
        assert.equal(headers.get('x-content-type-options'), 'nosniff');
        assert.equal(headers.get('referrer-policy'), 'same-origin');
    });
});

describe('logging in', () => {
    test('wrong password is refused', async () => {
        const response = await request('/login', { method: 'POST', form: { username: ADMIN.username, password: 'wrong-password' } });
        assert.equal(response.status, 401);
        assert.equal(response.cookie, undefined);
    });

    test('the admin can log in, use the app and log out', async () => {
        const cookie = await login(ADMIN.username, ADMIN.password);
        assert.match(cookie, /^scribe_session=/);

        const home = await request('/', { cookie });
        assert.equal(home.status, 200);
        assert.match(home.body, /Afmelden/);
        assert.match(home.body, /href="\/admin"/);
        assert.equal((await request('/js/app.js', { cookie })).status, 200);

        const logout = await request('/logout', { method: 'POST', cookie });
        assert.equal(logout.location, '/login');
        assert.equal((await request('/', { cookie })).status, 303);
    });

    test('usernames are case-insensitive', async () => {
        await login(ADMIN.username.toUpperCase(), ADMIN.password);
    });

    test('posts from another site are blocked', async () => {
        const response = await request('/login', {
            method: 'POST', origin: 'https://evil.example', form: { username: ADMIN.username, password: ADMIN.password },
        });
        assert.equal(response.status, 403);
    });

    test('files outside the public folder are not served', async () => {
        const cookie = await login(ADMIN.username, ADMIN.password);
        for (const path of ['/..%2fpackage.json', '/%2e%2e/package.json', '/css/..%2f..%2fserver%2fapp.js']) {
            assert.notEqual((await request(path, { cookie })).status, 200, path);
        }
    });
});

describe('invites', () => {
    let adminCookie;
    before(async () => {
        adminCookie = await login(ADMIN.username, ADMIN.password);
    });

    test('a personal invite works once', async () => {
        const invite = await createInvite(adminCookie);
        assert.equal((await request(invite)).status, 200);

        const response = await signUp(invite, 'broeder_jan');
        assert.equal(response.status, 303);
        assert.equal((await request('/', { cookie: response.cookie })).status, 200);

        assert.equal((await request(invite)).status, 404);
        assert.equal((await signUp(invite, 'broeder_piet')).status, 404);
    });

    test('a group invite works the chosen number of times', async () => {
        const invite = await createInvite(adminCookie, { label: 'Kloosterorde', maxUses: 3 });
        for (const name of ['monnik1', 'monnik2', 'monnik3']) {
            assert.equal((await signUp(invite, name)).status, 303, name);
        }
        assert.equal((await signUp(invite, 'monnik4')).status, 404);

        const admin = await request('/admin', { cookie: adminCookie });
        assert.match(admin.body, /Kloosterorde/);
        assert.match(admin.body, /3 \/ 3/);
    });

    test('a revoked invite stops working', async () => {
        const invite = await createInvite(adminCookie, { maxUses: 5 });
        const id = app.store.listInvites()[0].id;
        await request(`/admin/invites/${id}/revoke`, { method: 'POST', cookie: adminCookie });
        assert.equal((await signUp(invite, 'te_laat')).status, 404);
    });

    test('an expired invite stops working', async () => {
        const token = app.store.createInvite({ label: '', maxUses: 1, ttlMs: -DAY });
        assert.equal((await request(`/invite/${token}`)).status, 404);
    });

    test('unknown invite tokens are refused', async () => {
        assert.equal((await request('/invite/' + 'x'.repeat(43))).status, 404);
    });

    test('sign-up checks the username and password and does not use up the invite', async () => {
        const invite = await createInvite(adminCookie);
        assert.equal((await signUp(invite, 'a')).status, 400);
        assert.equal((await signUp(invite, 'naam met spaties')).status, 400);
        assert.equal((await signUp(invite, 'kort_wachtwoord', 'kort')).status, 400);
        assert.equal((await signUp(invite, 'andere_herhaling', 'een-lang-wachtwoord', 'iets-anders-dus')).status, 400);
        assert.equal((await signUp(invite, 'ABT')).status, 400);
        assert.equal((await signUp(invite, 'eindelijk_goed')).status, 303);
    });

    test('invite sign-up pages escape their input', async () => {
        const invite = await createInvite(adminCookie, { label: '<script>alert(1)</script>' });
        const page = await request(invite);
        assert.doesNotMatch(page.body, /<script>alert/);
        assert.match(page.body, /&lt;script&gt;/);
    });
});

describe('admin', () => {
    test('regular users cannot reach the admin pages', async () => {
        const adminCookie = await login(ADMIN.username, ADMIN.password);
        const invite = await createInvite(adminCookie);
        const { cookie } = await signUp(invite, 'gewone_monnik');

        assert.doesNotMatch((await request('/', { cookie })).body, /href="\/admin"/);
        assert.equal((await request('/admin', { cookie })).status, 404);
        assert.equal((await request('/admin/invites', { method: 'POST', cookie, form: { maxUses: 1, days: 1 } })).status, 404);
    });

    test('deleting a user ends their sessions', async () => {
        const adminCookie = await login(ADMIN.username, ADMIN.password);
        const invite = await createInvite(adminCookie);
        const { cookie } = await signUp(invite, 'verbannen');
        assert.equal((await request('/', { cookie })).status, 200);

        const user = app.store.findUserByName('verbannen');
        await request(`/admin/users/${user.id}/delete`, { method: 'POST', cookie: adminCookie });
        assert.equal((await request('/', { cookie })).status, 303);
    });

    test('the admin account cannot be deleted', async () => {
        const adminCookie = await login(ADMIN.username, ADMIN.password);
        const admin = app.store.findUserByName(ADMIN.username);
        await request(`/admin/users/${admin.id}/delete`, { method: 'POST', cookie: adminCookie });
        assert.ok(app.store.findUserByName(ADMIN.username));
    });

    test('invalid invite settings are refused', async () => {
        const adminCookie = await login(ADMIN.username, ADMIN.password);
        const response = await request('/admin/invites', { method: 'POST', cookie: adminCookie, form: { maxUses: 0, days: 7 } });
        assert.equal(response.status, 400);
    });
});

// Runs last: it blocks further logins for this username
describe('brute force protection', () => {
    test('logins are blocked after too many failed attempts', async () => {
        for (let i = 0; i < 10; i++) {
            await request('/login', { method: 'POST', form: { username: 'gewone_monnik', password: `poging-${i}` } });
        }
        const response = await request('/login', {
            method: 'POST', form: { username: 'gewone_monnik', password: 'een-lang-wachtwoord' },
        });
        assert.equal(response.status, 429);
    });
});
