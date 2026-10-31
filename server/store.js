import { DatabaseSync } from 'node:sqlite';
import { hashToken, newToken } from './security.js';

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS invites (
        id          INTEGER PRIMARY KEY,
        token_hash  TEXT    NOT NULL UNIQUE,
        label       TEXT    NOT NULL DEFAULT '',
        max_uses    INTEGER NOT NULL,
        uses        INTEGER NOT NULL DEFAULT 0,
        expires_at  INTEGER NOT NULL,
        revoked_at  INTEGER,
        created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY,
        username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT    NOT NULL,
        is_admin      INTEGER NOT NULL DEFAULT 0,
        invite_id     INTEGER REFERENCES invites(id) ON DELETE SET NULL,
        created_at    INTEGER NOT NULL,
        last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id_hash    TEXT    PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
`;

export function inviteStatus(invite, now = Date.now()) {
    if (invite.revoked_at) return 'revoked';
    if (invite.uses >= invite.max_uses) return 'used';
    if (invite.expires_at <= now) return 'expired';
    return 'active';
}

// All database access goes through here. Times are milliseconds since the epoch.
export class Store {
    constructor(file) {
        this.db = new DatabaseSync(file);
        this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
        this.db.exec(SCHEMA);
    }

    close() {
        this.db.close();
    }

    #transaction(fn) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const result = fn();
            this.db.exec('COMMIT');
            return result;
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    // ---------- Users ----------

    findUserByName(username) {
        return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    }

    createUser({ username, passwordHash, isAdmin = false, inviteId = null }) {
        const result = this.db.prepare(
            'INSERT INTO users (username, password_hash, is_admin, invite_id, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(username, passwordHash, isAdmin ? 1 : 0, inviteId, Date.now());
        return Number(result.lastInsertRowid);
    }

    setPassword(userId, passwordHash) {
        this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
        this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    }

    setAdmin(userId) {
        this.db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);
    }

    recordLogin(userId) {
        this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(Date.now(), userId);
    }

    listUsers() {
        return this.db.prepare(`
            SELECT users.*, invites.label AS invite_label
            FROM users LEFT JOIN invites ON invites.id = users.invite_id
            ORDER BY users.created_at
        `).all();
    }

    deleteUser(userId) {
        // Sessions go with it through ON DELETE CASCADE; admins can't be deleted here
        return this.db.prepare('DELETE FROM users WHERE id = ? AND is_admin = 0').run(userId).changes === 1;
    }

    // ---------- Sessions ----------

    createSession(userId, ttlMs) {
        const token = newToken();
        this.db.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)')
            .run(hashToken(token), userId, Date.now() + ttlMs);
        return token;
    }

    // Returns the session's user, extending sessions that are past half their lifetime
    findSessionUser(token, ttlMs) {
        const now = Date.now();
        const idHash = hashToken(token);
        const row = this.db.prepare(`
            SELECT users.id, users.username, users.is_admin, sessions.expires_at
            FROM sessions JOIN users ON users.id = sessions.user_id
            WHERE sessions.id_hash = ? AND sessions.expires_at > ?
        `).get(idHash, now);
        if (!row) return null;

        const extended = row.expires_at - now < ttlMs / 2;
        if (extended) {
            this.db.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?').run(now + ttlMs, idHash);
        }
        return { id: row.id, username: row.username, isAdmin: row.is_admin === 1, extended };
    }

    deleteSession(token) {
        this.db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashToken(token));
    }

    deleteExpiredSessions() {
        this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    }

    // ---------- Invites ----------

    // Returns the plain token; only its hash is stored, so it can be shown just once
    createInvite({ label, maxUses, ttlMs }) {
        const token = newToken();
        const now = Date.now();
        this.db.prepare('INSERT INTO invites (token_hash, label, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(hashToken(token), label, maxUses, now + ttlMs, now);
        return token;
    }

    findActiveInvite(token) {
        const invite = this.db.prepare('SELECT * FROM invites WHERE token_hash = ?').get(hashToken(token));
        return invite && inviteStatus(invite) === 'active' ? invite : null;
    }

    listInvites() {
        return this.db.prepare(`
            SELECT invites.*, COUNT(users.id) AS user_count
            FROM invites LEFT JOIN users ON users.invite_id = invites.id
            GROUP BY invites.id
            ORDER BY invites.created_at DESC
        `).all();
    }

    revokeInvite(inviteId) {
        this.db.prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(Date.now(), inviteId);
    }

    // Uses up one place on the invite and creates the account in one go, so a group link
    // can never be used more often than allowed. Returns null when the invite is no longer valid.
    redeemInvite(inviteId, { username, passwordHash }) {
        return this.#transaction(() => {
            const claimed = this.db.prepare(`
                UPDATE invites SET uses = uses + 1
                WHERE id = ? AND revoked_at IS NULL AND uses < max_uses AND expires_at > ?
            `).run(inviteId, Date.now());
            if (claimed.changes !== 1) return null;
            return this.createUser({ username, passwordHash, inviteId });
        });
    }
}
