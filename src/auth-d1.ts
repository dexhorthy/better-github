import type { D1Database } from "@cloudflare/workers-types";
import type { AuthDB } from "./auth-core";

export function makeD1AuthDb(db: D1Database): AuthDB {
	let initialized = false;

	return {
		async init() {
			if (initialized) return;
			await db
				.prepare(
					`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )`,
				)
				.run();
			await db
				.prepare(
					`CREATE TABLE IF NOT EXISTS magic_link_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )`,
				)
				.run();
			initialized = true;
		},
		async upsertUser(email) {
			await db
				.prepare(
					"INSERT INTO users (email) VALUES (?) ON CONFLICT (email) DO NOTHING",
				)
				.bind(email)
				.run();
		},
		async deleteTokensByEmail(email) {
			await db
				.prepare("DELETE FROM magic_link_tokens WHERE email = ?")
				.bind(email)
				.run();
		},
		async insertToken(email, token, expiresAt) {
			await db
				.prepare(
					"INSERT INTO magic_link_tokens (email, token, expires_at) VALUES (?, ?, ?)",
				)
				.bind(email, token, expiresAt)
				.run();
		},
		async getToken(token) {
			return db
				.prepare(
					"SELECT email, expires_at FROM magic_link_tokens WHERE token = ?",
				)
				.bind(token)
				.first<{ email: string; expires_at: string }>();
		},
		async deleteToken(token) {
			await db
				.prepare("DELETE FROM magic_link_tokens WHERE token = ?")
				.bind(token)
				.run();
		},
		async hasPendingToken(email, now) {
			const row = await db
				.prepare(
					"SELECT id FROM magic_link_tokens WHERE email = ? AND expires_at > ?",
				)
				.bind(email, now)
				.first<{ id: number }>();
			return row !== null;
		},
	};
}
