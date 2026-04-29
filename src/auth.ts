import { Database } from "bun:sqlite";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
const ALGORITHM = "HS256";

const db = new Database(process.env.AUTH_DB_PATH ?? "auth.db", {
	create: true,
});

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

function base64url(data: Uint8Array): string {
	return btoa(String.fromCharCode(...data))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(b64);
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function sign(payload: Record<string, unknown>): Promise<string> {
	const header = base64url(
		new TextEncoder().encode(JSON.stringify({ alg: ALGORITHM, typ: "JWT" })),
	);
	const body = base64url(
		new TextEncoder().encode(
			JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }),
		),
	);
	const signingInput = `${header}.${body}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(JWT_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(signingInput),
	);
	return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

async function verify(token: string): Promise<Record<string, unknown> | null> {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [header, body, signature] = parts;
	const signingInput = `${header}.${body}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(JWT_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		base64urlDecode(signature),
		new TextEncoder().encode(signingInput),
	);
	if (!valid) return null;
	try {
		return JSON.parse(
			new TextDecoder().decode(base64urlDecode(body)),
		) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export type AuthResult =
	| { ok: true; token: string; email: string }
	| { ok: false; error: string };

export async function register(
	email: string,
	password: string,
): Promise<AuthResult> {
	if (!email || !password)
		return { ok: false, error: "Email and password are required" };
	if (password.length < 8)
		return { ok: false, error: "Password must be at least 8 characters" };

	const existing = db.query("SELECT id FROM users WHERE email = ?").get(email);
	if (existing) return { ok: false, error: "Email already registered" };

	const hash = await Bun.password.hash(password);
	db.run("INSERT INTO users (email, password_hash) VALUES (?, ?)", [
		email,
		hash,
	]);
	const token = await sign({ email });
	return { ok: true, token, email };
}

export async function login(
	email: string,
	password: string,
): Promise<AuthResult> {
	if (!email || !password)
		return { ok: false, error: "Email and password are required" };

	const user = db
		.query("SELECT password_hash FROM users WHERE email = ?")
		.get(email) as { password_hash: string } | null;
	if (!user) return { ok: false, error: "Invalid email or password" };

	const valid = await Bun.password.verify(password, user.password_hash);
	if (!valid) return { ok: false, error: "Invalid email or password" };

	const token = await sign({ email });
	return { ok: true, token, email };
}

export async function verifyToken(
	token: string,
): Promise<{ email: string } | null> {
	const payload = await verify(token);
	if (!payload || typeof payload.email !== "string") return null;
	return { email: payload.email };
}
