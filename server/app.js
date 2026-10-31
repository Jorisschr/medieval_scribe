import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { RateLimiter, burnPasswordCheck, hashPassword, verifyPassword } from './security.js';
import { Store, inviteStatus } from './store.js';
import { accountNav, adminPage, invitePage, loginPage, messagePage } from './views.js';

const DAY = 24 * 60 * 60 * 1000;
const USERNAME = /^[A-Za-z0-9_.-]{3,32}$/;
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 200;
const MAX_BODY = 16 * 1024;

const CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
};

// Files the login and invite pages need before anyone is signed in
const PUBLIC_PREFIXES = ['/css/', '/images/', '/fonts/'];

const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
].join('; ');

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export function createApp(config) {
    const store = new Store(config.databaseFile ?? join(config.dataDir, 'scribe.db'));
    const sessionTtl = config.sessionDays * DAY;
    const cookieName = config.secureCookies ? '__Host-scribe_session' : 'scribe_session';
    const loginLimiter = new RateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
    const staticCache = new Map();
    const indexTemplate = readFileSync(join(config.publicDir, 'index.html'), 'utf8');

    // ---------- Helpers ----------

    function clientIp(req) {
        if (config.trustProxy) {
            // Cloudflare (including Cloudflare Tunnel) puts the visitor's address in its own header
            const cloudflare = req.headers['cf-connecting-ip'];
            if (cloudflare) return cloudflare;
            const forwarded = req.headers['x-forwarded-for']?.split(',').at(-1)?.trim();
            if (forwarded) return forwarded;
        }
        return req.socket.remoteAddress;
    }

    function parseCookies(req) {
        const cookies = {};
        for (const part of (req.headers.cookie ?? '').split(';')) {
            const index = part.indexOf('=');
            if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
        }
        return cookies;
    }

    function sessionCookie(token, maxAgeSeconds) {
        return [
            `${cookieName}=${token}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${maxAgeSeconds}`,
            config.secureCookies && 'Secure',
        ].filter(Boolean).join('; ');
    }

    function startSession(res, userId) {
        const token = store.createSession(userId, sessionTtl);
        store.recordLogin(userId);
        res.setHeader('Set-Cookie', sessionCookie(token, sessionTtl / 1000));
    }

    // Forms may only be posted from our own pages. SameSite cookies already block most
    // cross-site posts; checking the Origin header covers older browsers too.
    function isSameOrigin(req) {
        const origin = req.headers.origin;
        if (!origin) return true;
        if (origin === config.publicUrl) return true;
        const host = (config.trustProxy && req.headers['x-forwarded-host']) || req.headers.host;
        try {
            return new URL(origin).host === host;
        } catch {
            return false;
        }
    }

    async function readForm(req) {
        if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
            throw new HttpError(415, 'Unsupported form encoding');
        }
        let body = '';
        for await (const chunk of req) {
            body += chunk;
            if (body.length > MAX_BODY) throw new HttpError(413, 'Form too large');
        }
        return Object.fromEntries(new URLSearchParams(body));
    }

    function send(res, status, body, type = 'text/html; charset=utf-8') {
        res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(body);
    }

    function redirect(res, location) {
        res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
        res.end();
    }

    function validateCredentials(username, password, confirm) {
        if (!USERNAME.test(username)) {
            return 'Een gebruikersnaam heeft 3 tot 32 tekens: letters, cijfers, punt, streepje of underscore.';
        }
        if (password.length < MIN_PASSWORD) return `Een wachtwoord heeft minstens ${MIN_PASSWORD} tekens.`;
        if (password.length > MAX_PASSWORD) return `Een wachtwoord heeft hoogstens ${MAX_PASSWORD} tekens.`;
        if (password !== confirm) return 'De wachtwoorden komen niet overeen.';
        return null;
    }

    function parseInteger(value, min, max) {
        const number = Number(value);
        return Number.isInteger(number) && number >= min && number <= max ? number : null;
    }

    async function serveStatic(req, res, pathname) {
        const file = normalize(join(config.publicDir, pathname));
        if (!file.startsWith(config.publicDir + sep)) throw new HttpError(404, 'Not found');

        let entry = staticCache.get(file);
        if (!entry) {
            let body;
            try {
                body = await readFile(file);
            } catch {
                throw new HttpError(404, 'Not found');
            }
            const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
            entry = { body, etag, type: CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' };
            // In development files are read again on every request, so edits show up right away
            if (config.production) staticCache.set(file, entry);
        }

        const headers = { 'Content-Type': entry.type, ETag: entry.etag, 'Cache-Control': 'no-cache' };
        if (req.headers['if-none-match'] === entry.etag) {
            res.writeHead(304, headers);
            res.end();
            return;
        }
        res.writeHead(200, headers);
        res.end(req.method === 'HEAD' ? undefined : entry.body);
    }

    // ---------- Routes ----------

    async function showApp({ res, user }) {
        const template = config.production ? indexTemplate : readFileSync(join(config.publicDir, 'index.html'), 'utf8');
        send(res, 200, template.replace('<!-- account -->', accountNav(user).toString()));
    }

    async function login({ req, res }) {
        const form = await readForm(req);
        const username = String(form.username ?? '').trim();
        const password = String(form.password ?? '');
        const ipKey = `ip:${clientIp(req)}`;
        const userKey = `user:${username.toLowerCase()}`;

        if (loginLimiter.isBlocked(ipKey) || loginLimiter.isBlocked(userKey)) {
            send(res, 429, loginPage({ username, error: 'Te veel pogingen. Probeer het over een kwartier opnieuw.' }));
            return;
        }

        const user = username && password.length <= MAX_PASSWORD ? store.findUserByName(username) : null;
        const valid = user ? await verifyPassword(password, user.password_hash) : (await burnPasswordCheck(password), false);
        if (!valid) {
            loginLimiter.fail(ipKey);
            loginLimiter.fail(userKey);
            send(res, 401, loginPage({ username, error: 'Onbekende gebruikersnaam of verkeerd wachtwoord.' }));
            return;
        }

        loginLimiter.reset(userKey);
        startSession(res, user.id);
        redirect(res, '/');
    }

    function logout({ req, res }) {
        const token = parseCookies(req)[cookieName];
        if (token) store.deleteSession(token);
        res.setHeader('Set-Cookie', sessionCookie('', 0));
        redirect(res, '/login');
    }

    function invalidInvite(res, user) {
        send(res, 404, messagePage({
            title: 'Ongeldige uitnodiging',
            message: 'Deze uitnodiging bestaat niet, is verlopen of is al opgebruikt. Vraag de beheerder om een nieuwe link.',
            user,
        }));
    }

    function showInvite({ res, params, user }) {
        const invite = store.findActiveInvite(params.token);
        if (!invite) return invalidInvite(res, user);
        send(res, 200, invitePage({ invite, token: params.token }));
    }

    async function acceptInvite({ req, res, params, user }) {
        const invite = store.findActiveInvite(params.token);
        if (!invite) return invalidInvite(res, user);

        const form = await readForm(req);
        const username = String(form.username ?? '').trim();
        const password = String(form.password ?? '');
        const retry = error => send(res, 400, invitePage({ invite, token: params.token, username, error }));

        const problem = validateCredentials(username, password, String(form.confirm ?? ''));
        if (problem) return retry(problem);
        if (store.findUserByName(username)) return retry('Deze gebruikersnaam is al in gebruik.');

        const passwordHash = await hashPassword(password);
        let userId;
        try {
            userId = store.redeemInvite(invite.id, { username, passwordHash });
        } catch (error) {
            // Someone took the same name while the password was being hashed
            if (/UNIQUE constraint failed/.test(error.message)) return retry('Deze gebruikersnaam is al in gebruik.');
            throw error;
        }
        if (userId === null) return invalidInvite(res, user);

        startSession(res, userId);
        redirect(res, '/');
    }

    function showAdmin({ res, user }, extra = {}, status = 200) {
        send(res, status, adminPage({
            user,
            invites: store.listInvites(),
            users: store.listUsers(),
            inviteStatus,
            ...extra,
        }));
    }

    async function createInvite(context) {
        const form = await readForm(context.req);
        const label = String(form.label ?? '').trim().slice(0, 60);
        const maxUses = parseInteger(form.maxUses, 1, 1000);
        const days = parseInteger(form.days, 1, 365);
        if (maxUses === null || days === null) {
            return showAdmin(context, { error: 'Kies 1 tot 1000 personen en 1 tot 365 dagen.' }, 400);
        }
        const token = store.createInvite({ label, maxUses, ttlMs: days * DAY });
        showAdmin(context, { newLink: `${config.publicUrl}/invite/${token}` });
    }

    function revokeInvite({ res, params }) {
        store.revokeInvite(Number(params.id));
        redirect(res, '/admin');
    }

    function deleteUser({ res, params }) {
        store.deleteUser(Number(params.id));
        redirect(res, '/admin');
    }

    // access: 'public' (anyone), 'guest' (only when signed out), 'user' or 'admin'
    const routes = [
        ['GET', /^\/$/, 'user', showApp],
        ['GET', /^\/login$/, 'guest', ({ res }) => send(res, 200, loginPage())],
        ['POST', /^\/login$/, 'guest', login],
        ['POST', /^\/logout$/, 'public', logout],
        ['GET', /^\/invite\/(?<token>[A-Za-z0-9_-]{20,100})$/, 'public', showInvite],
        ['POST', /^\/invite\/(?<token>[A-Za-z0-9_-]{20,100})$/, 'public', acceptInvite],
        ['GET', /^\/admin$/, 'admin', showAdmin],
        ['POST', /^\/admin\/invites$/, 'admin', createInvite],
        ['POST', /^\/admin\/invites\/(?<id>\d+)\/revoke$/, 'admin', revokeInvite],
        ['POST', /^\/admin\/users\/(?<id>\d+)\/delete$/, 'admin', deleteUser],
    ];

    function currentUser(req, res) {
        const token = parseCookies(req)[cookieName];
        if (!token) return null;
        const user = store.findSessionUser(token, sessionTtl);
        if (user?.extended) res.setHeader('Set-Cookie', sessionCookie(token, sessionTtl / 1000));
        return user;
    }

    async function handle(req, res) {
        const { pathname } = new URL(req.url, 'http://localhost');

        if (pathname === '/healthz') return send(res, 200, 'ok', 'text/plain; charset=utf-8');

        res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // same-origin rather than no-referrer: with no-referrer browsers post forms with "Origin: null"
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        if (config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000');

        if (req.method === 'POST' && !isSameOrigin(req)) throw new HttpError(403, 'Cross-site request blocked');

        const user = currentUser(req, res);

        for (const [method, pattern, access, handler] of routes) {
            const match = pathname.match(pattern);
            if (!match) continue;
            if (method !== req.method && !(method === 'GET' && req.method === 'HEAD')) continue;

            if (access === 'guest' && user) return redirect(res, '/');
            if ((access === 'user' || access === 'admin') && !user) return redirect(res, '/login');
            if (access === 'admin' && !user.isAdmin) throw new HttpError(404, 'Not found');
            return handler({ req, res, params: match.groups ?? {}, user });
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
        if (pathname === '/index.html') return redirect(res, '/');
        if (!user && !PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) return redirect(res, '/login');
        return serveStatic(req, res, pathname);
    }

    const server = createServer(async (req, res) => {
        const started = performance.now();
        try {
            await handle(req, res);
        } catch (error) {
            const status = error instanceof HttpError ? error.status : 500;
            if (status === 500) console.error(error);
            if (!res.headersSent) send(res, status, status === 500 ? 'Internal server error' : error.message, 'text/plain; charset=utf-8');
            else res.end();
        } finally {
            if (config.log && req.url !== '/healthz') {
                // Invite tokens are secrets, so they are left out of the logs
                const path = req.url.replace(/^\/invite\/[^/?]+/, '/invite/…');
                console.log(`${req.method} ${path} ${res.statusCode} ${Math.round(performance.now() - started)}ms`);
            }
        }
    });

    const cleanup = setInterval(() => store.deleteExpiredSessions(), 60 * 60 * 1000);
    cleanup.unref();

    // Creates the admin account from ADMIN_USERNAME / ADMIN_PASSWORD, or updates its password
    // when ADMIN_PASSWORD changed, so the environment is the way to reset it.
    async function ensureAdmin() {
        const { adminUsername, adminPassword } = config;
        const hasAdmin = store.listUsers().some(row => row.is_admin === 1);
        if (!adminUsername || !adminPassword) {
            if (!hasAdmin) throw new Error('No admin account yet: set ADMIN_USERNAME and ADMIN_PASSWORD.');
            return;
        }
        if (!USERNAME.test(adminUsername)) throw new Error('ADMIN_USERNAME may only contain letters, digits, ".", "-" and "_" (3 to 32).');
        if (adminPassword.length < MIN_PASSWORD) throw new Error(`ADMIN_PASSWORD needs at least ${MIN_PASSWORD} characters.`);

        const existing = store.findUserByName(adminUsername);
        if (!existing) {
            store.createUser({ username: adminUsername, passwordHash: await hashPassword(adminPassword), isAdmin: true });
            console.log(`Created admin account "${adminUsername}".`);
            return;
        }
        if (existing.is_admin !== 1) store.setAdmin(existing.id);
        if (!(await verifyPassword(adminPassword, existing.password_hash))) {
            store.setPassword(existing.id, await hashPassword(adminPassword));
            console.log(`Updated the password of admin account "${adminUsername}".`);
        }
    }

    return {
        server,
        store,
        ensureAdmin,
        close() {
            clearInterval(cleanup);
            return new Promise(resolve => {
                server.close(() => {
                    store.close();
                    resolve();
                });
                server.closeIdleConnections();
            });
        },
    };
}
