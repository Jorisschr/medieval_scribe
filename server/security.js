import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// 32 MB of memory per hash: strong enough, and still light for a small home server
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 32 };

function deriveKey(password, salt, { N, r, p, keyLength }) {
    return scryptAsync(password.normalize('NFKC'), salt, keyLength, { N, r, p, maxmem: 256 * N * r });
}

// Stored as scrypt$N$r$p$salt$key, so the parameters can be raised later without breaking old hashes
export async function hashPassword(password) {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, SCRYPT);
    return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password, stored) {
    const [scheme, N, r, p, salt, key] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(key, 'base64url');
    const actual = await deriveKey(password, Buffer.from(salt, 'base64url'),
        { N: Number(N), r: Number(r), p: Number(p), keyLength: expected.length });
    return timingSafeEqual(expected, actual);
}

// Hashing a password for unknown usernames too keeps login timing from revealing which names exist
let dummyHash;
export async function burnPasswordCheck(password) {
    dummyHash ??= await hashPassword(randomBytes(16).toString('hex'));
    await verifyPassword(password, dummyHash);
}

// Random tokens for sessions and invite links. Only their hash is stored,
// so a leaked database doesn't give away working links or sessions.
export function newToken() {
    return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
    return createHash('sha256').update(token).digest('base64url');
}

// Counts failed attempts per key (an IP address or username) within a time window.
export class RateLimiter {
    #attempts = new Map();

    constructor({ limit, windowMs }) {
        this.limit = limit;
        this.windowMs = windowMs;
    }

    isBlocked(key, now = Date.now()) {
        const entry = this.#attempts.get(key);
        return entry !== undefined && entry.resetAt > now && entry.count >= this.limit;
    }

    fail(key, now = Date.now()) {
        let entry = this.#attempts.get(key);
        if (!entry || entry.resetAt <= now) {
            if (this.#attempts.size > 10_000) this.#prune(now);
            entry = { count: 0, resetAt: now + this.windowMs };
            this.#attempts.set(key, entry);
        }
        entry.count++;
    }

    reset(key) {
        this.#attempts.delete(key);
    }

    #prune(now) {
        for (const [key, entry] of this.#attempts) {
            if (entry.resetAt <= now) this.#attempts.delete(key);
        }
    }
}
