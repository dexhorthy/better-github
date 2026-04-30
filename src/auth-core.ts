// Core auth logic: JWT helpers, magic-link flow, and a DB interface.
// Implementations of AuthDB are in auth.ts (Bun/Postgres) and auth-d1.ts (D1).

const ALGORITHM = "HS256";
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface AuthDB {
	init(): Promise<void>;
	upsertUser(email: string): Promise<void>;
	deleteTokensByEmail(email: string): Promise<void>;
	insertToken(email: string, token: string, expiresAt: number): Promise<void>;
	getToken(
		token: string,
	): Promise<{ email: string; expires_at: string } | null>;
	deleteToken(token: string): Promise<void>;
	hasPendingToken(email: string, now: number): Promise<boolean>;
}

export type MagicLinkResult = { ok: true } | { ok: false; error: string };

export type VerifyResult =
	| { ok: true; token: string; email: string }
	| { ok: false; error: string };

function base64url(data: Uint8Array): string {
	return btoa(String.fromCharCode(...data))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array<ArrayBuffer> {
	const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export async function signJwt(
	payload: Record<string, unknown>,
	secret: string,
): Promise<string> {
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
		new TextEncoder().encode(secret),
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

export async function verifyJwt(
	token: string,
	secret: string,
): Promise<Record<string, unknown> | null> {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [header, body, signature] = parts;
	if (!header || !body || !signature) return null;
	const signingInput = `${header}.${body}`;
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
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

export function generateToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return base64url(bytes);
}

export async function sendMagicLinkEmail(
	email: string,
	token: string,
	baseUrl: string,
	apiKey: string,
	domain: string,
): Promise<void> {
	const link = `${baseUrl}/?token=${encodeURIComponent(token)}`;

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

export async function requestMagicLink(
	db: AuthDB,
	email: string,
	baseUrl: string,
	resendApiKey: string | undefined,
	resendDomain: string,
): Promise<MagicLinkResult> {
	if (!email) return { ok: false, error: "Email is required" };
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		return { ok: false, error: "Invalid email address" };

	await db.init();
	await db.upsertUser(email);
	await db.deleteTokensByEmail(email);

	const token = generateToken();
	const expiresAt = Date.now() + TOKEN_TTL_MS;
	await db.insertToken(email, token, expiresAt);

	if (!resendApiKey) throw new Error("RESEND_API_KEY not configured");

	try {
		await sendMagicLinkEmail(email, token, baseUrl, resendApiKey, resendDomain);
	} catch (err) {
		await db.deleteToken(token);
		console.error("Magic link email failed:", err);
		return { ok: false, error: "Failed to send magic link email" };
	}

	return { ok: true };
}

export async function verifyMagicLink(
	db: AuthDB,
	rawToken: string,
	jwtSecret: string,
): Promise<VerifyResult> {
	if (!rawToken) return { ok: false, error: "Token is required" };

	await db.init();

	const row = await db.getToken(rawToken);
	if (!row) return { ok: false, error: "Invalid or expired token" };

	if (Date.now() > Number(row.expires_at)) {
		await db.deleteToken(rawToken);
		return { ok: false, error: "Invalid or expired token" };
	}

	await db.deleteToken(rawToken);

	const jwt = await signJwt({ email: row.email }, jwtSecret);
	return { ok: true, token: jwt, email: row.email };
}

export async function verifyToken(
	token: string,
	jwtSecret: string,
): Promise<{ email: string } | null> {
	const payload = await verifyJwt(token, jwtSecret);
	if (!payload || typeof payload.email !== "string") return null;
	return { email: payload.email };
}
