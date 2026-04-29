import { SQL } from "bun";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";
const ALGORITHM = "HS256";
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

const DATABASE_URL =
	process.env.DATABASE_URL ??
	"postgres://postgres:postgres@localhost:5434/better_github";

const sql = new SQL(DATABASE_URL);

async function initDb(): Promise<void> {
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
}

// Initialize schema on module load
const _ready = initDb();

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

async function verifyJwt(
	token: string,
): Promise<Record<string, unknown> | null> {
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

function generateToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return base64url(bytes);
}

async function sendMagicLinkEmail(
	email: string,
	token: string,
	baseUrl: string,
): Promise<void> {
	const apiKey = process.env.RESEND_API_KEY;
	const domain = process.env.RESEND_API_DOMAN ?? "better-github.com";
	if (!apiKey) throw new Error("RESEND_API_KEY not configured");

	const link = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: `Better GitHub <noreply@${domain}>`,
			to: [email],
			subject: "Your Better GitHub sign-in link",
			html: `<p>Click the link below to sign in. It expires in 15 minutes.</p><p><a href="${link}">Sign in to Better GitHub</a></p><p>Or copy this link: ${link}</p>`,
		}),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Resend API error ${res.status}: ${text}`);
	}
}

export type MagicLinkResult = { ok: true } | { ok: false; error: string };

export async function requestMagicLink(
	email: string,
	baseUrl: string,
): Promise<MagicLinkResult> {
	if (!email) return { ok: false, error: "Email is required" };
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		return { ok: false, error: "Invalid email address" };

	await _ready;

	// Upsert the user so they exist when the token is later verified
	await sql`INSERT INTO users (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;

	// Delete any existing tokens for this email before issuing a new one
	await sql`DELETE FROM magic_link_tokens WHERE email = ${email}`;

	const token = generateToken();
	const expiresAt = Date.now() + TOKEN_TTL_MS;

	await sql`INSERT INTO magic_link_tokens (email, token, expires_at) VALUES (${email}, ${token}, ${expiresAt})`;

	try {
		await sendMagicLinkEmail(email, token, baseUrl);
	} catch (err) {
		// Clean up the token if email delivery fails
		await sql`DELETE FROM magic_link_tokens WHERE token = ${token}`;
		console.error("Magic link email failed:", err);
		return { ok: false, error: "Failed to send magic link email" };
	}

	return { ok: true };
}

export type VerifyResult =
	| { ok: true; token: string; email: string }
	| { ok: false; error: string };

export async function verifyMagicLink(rawToken: string): Promise<VerifyResult> {
	if (!rawToken) return { ok: false, error: "Token is required" };

	await _ready;

	const rows = await sql<
		{ email: string; expires_at: string }[]
	>`SELECT email, expires_at FROM magic_link_tokens WHERE token = ${rawToken}`;

	const row = rows[0] ?? null;

	if (!row) return { ok: false, error: "Invalid or expired token" };

	if (Date.now() > Number(row.expires_at)) {
		await sql`DELETE FROM magic_link_tokens WHERE token = ${rawToken}`;
		return { ok: false, error: "Invalid or expired token" };
	}

	// Consume the token
	await sql`DELETE FROM magic_link_tokens WHERE token = ${rawToken}`;

	const jwt = await sign({ email: row.email });
	return { ok: true, token: jwt, email: row.email };
}

export async function verifyToken(
	token: string,
): Promise<{ email: string } | null> {
	const payload = await verifyJwt(token);
	if (!payload || typeof payload.email !== "string") return null;
	return { email: payload.email };
}

// Exported for testing only — lets tests insert a token row directly
export async function _insertTestToken(
	email: string,
	token: string,
	expiresAt: number,
): Promise<void> {
	await _ready;
	await sql`INSERT INTO users (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
	await sql`INSERT INTO magic_link_tokens (email, token, expires_at) VALUES (${email}, ${token}, ${expiresAt})`;
}

// Exported for testing only — checks whether a pending token row exists
export async function _hasPendingToken(email: string): Promise<boolean> {
	await _ready;
	const rows = await sql<
		{ id: number }[]
	>`SELECT id FROM magic_link_tokens WHERE email = ${email} AND expires_at > ${Date.now()}`;
	return rows.length > 0;
}
