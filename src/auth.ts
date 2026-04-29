import { SQL } from "bun";
import type { AuthDB, MagicLinkResult, VerifyResult } from "./auth-core";
import {
	requestMagicLink as _requestMagicLink,
	verifyMagicLink as _verifyMagicLink,
	verifyToken as _verifyToken,
} from "./auth-core";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";

const DATABASE_URL =
	process.env.DATABASE_URL ??
	"postgres://postgres:postgres@localhost:5434/better_github";

const sql = new SQL(DATABASE_URL);

let initialized = false;
async function ensureInit(): Promise<void> {
	if (initialized) return;
	await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
	await sql`
    CREATE TABLE IF NOT EXISTS magic_link_tokens (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
	initialized = true;
}

const bunDb: AuthDB = {
	async init() {
		await ensureInit();
	},
	async upsertUser(email) {
		await sql`INSERT INTO users (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
	},
	async deleteTokensByEmail(email) {
		await sql`DELETE FROM magic_link_tokens WHERE email = ${email}`;
	},
	async insertToken(email, token, expiresAt) {
		await sql`INSERT INTO magic_link_tokens (email, token, expires_at) VALUES (${email}, ${token}, ${expiresAt})`;
	},
	async getToken(token) {
		const rows = await sql<
			{ email: string; expires_at: string }[]
		>`SELECT email, expires_at FROM magic_link_tokens WHERE token = ${token}`;
		return rows[0] ?? null;
	},
	async deleteToken(token) {
		await sql`DELETE FROM magic_link_tokens WHERE token = ${token}`;
	},
	async hasPendingToken(email, now) {
		const rows = await sql<
			{ id: number }[]
		>`SELECT id FROM magic_link_tokens WHERE email = ${email} AND expires_at > ${now}`;
		return rows.length > 0;
	},
};

export type { MagicLinkResult, VerifyResult };

export async function requestMagicLink(
	email: string,
	baseUrl: string,
): Promise<MagicLinkResult> {
	return _requestMagicLink(
		bunDb,
		email,
		baseUrl,
		process.env.RESEND_API_KEY,
		process.env.RESEND_API_DOMAN ?? "better-github.com",
	);
}

export async function verifyMagicLink(rawToken: string): Promise<VerifyResult> {
	return _verifyMagicLink(bunDb, rawToken, JWT_SECRET);
}

export async function verifyToken(
	token: string,
): Promise<{ email: string } | null> {
	return _verifyToken(token, JWT_SECRET);
}

// Exported for testing only — lets tests insert a token row directly
export async function _insertTestToken(
	email: string,
	token: string,
	expiresAt: number,
): Promise<void> {
	await bunDb.init();
	await bunDb.upsertUser(email);
	await bunDb.insertToken(email, token, expiresAt);
}

// Exported for testing only — checks whether a pending token row exists
export async function _hasPendingToken(email: string): Promise<boolean> {
	await bunDb.init();
	return bunDb.hasPendingToken(email, Date.now());
}
