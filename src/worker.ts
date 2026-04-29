import type { D1Database } from "@cloudflare/workers-types";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AuthDB, MagicLinkResult, VerifyResult } from "./auth-core";
import { requestMagicLink, verifyMagicLink, verifyToken } from "./auth-core";
import { repositories } from "./data";
import { fetchFreestyleRepoData } from "./freestyle-git";
import { buildRepositoryOverview } from "./repository-overview";

type Env = {
	DB: D1Database;
	JWT_SECRET?: string;
	FREESTYLE_API_KEY?: string;
	FREESTYLE_REPO_ID?: string;
	RESEND_API_KEY?: string;
	RESEND_API_DOMAN?: string;
};

type Variables = {
	user: { email: string };
};

function makeD1Db(db: D1Database): AuthDB {
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

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/auth/request-link", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { email?: string };
	const baseUrl = new URL(c.req.url).origin;
	const db = makeD1Db(c.env.DB);
	const jwtSecret = c.env.JWT_SECRET ?? "dev-secret-change-in-production";
	const result: MagicLinkResult = await requestMagicLink(
		db,
		body.email ?? "",
		baseUrl,
		c.env.RESEND_API_KEY,
		c.env.RESEND_API_DOMAN ?? "better-github.com",
	);
	// jwtSecret is used in verifyMagicLink, not requestMagicLink — silence unused var
	void jwtSecret;
	if (!result.ok) return c.json({ error: result.error }, 400);
	return c.json({ ok: true });
});

app.get("/api/auth/verify", async (c) => {
	const token = c.req.query("token") ?? "";
	const db = makeD1Db(c.env.DB);
	const jwtSecret = c.env.JWT_SECRET ?? "dev-secret-change-in-production";
	const result: VerifyResult = await verifyMagicLink(db, token, jwtSecret);
	if (!result.ok) return c.json({ error: result.error }, 401);
	return c.json({ token: result.token, email: result.email });
});

const requireAuth: MiddlewareHandler<{
	Bindings: Env;
	Variables: Variables;
}> = async (c, next) => {
	const authHeader = c.req.header("Authorization");
	const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
	if (!token) return c.json({ error: "Authentication required" }, 401);
	const jwtSecret = c.env.JWT_SECRET ?? "dev-secret-change-in-production";
	const user = await verifyToken(token, jwtSecret);
	if (!user) return c.json({ error: "Invalid or expired token" }, 401);
	c.set("user", user);
	await next();
};

app.get("/api/repos", requireAuth, (c) => {
	return c.json(repositories);
});

app.get("/api/repos/:owner/:repo", requireAuth, async (c) => {
	const { owner, repo } = c.req.param();
	const path = c.req.query("path") ?? "";
	const fixture = repositories.find(
		(item) => item.owner === owner && item.name === repo,
	);

	if (!fixture) {
		return c.json({ message: "Repository not found" }, 404);
	}

	// Set env vars from bindings so freestyle-git.ts can read process.env
	if (c.env.FREESTYLE_API_KEY) {
		process.env.FREESTYLE_API_KEY = c.env.FREESTYLE_API_KEY;
	}
	if (c.env.FREESTYLE_REPO_ID) {
		process.env.FREESTYLE_REPO_ID = c.env.FREESTYLE_REPO_ID;
	}

	const liveData = await fetchFreestyleRepoData(repo, path);
	return c.json(buildRepositoryOverview(fixture, path, liveData));
});

export default {
	fetch: app.fetch,
};
